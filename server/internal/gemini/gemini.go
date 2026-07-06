// Package gemini is a thin REST client for the Google Gemini generateContent
// API. It is used for server-side voice transcription and, optionally, insight
// generation. It calls the API directly over net/http (no SDK).
package gemini

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"strconv"
	"strings"
	"time"

	"still/server/internal/model"
)

const apiBase = "https://generativelanguage.googleapis.com/v1beta/models"

// maxTTSResponseBytes caps the synthesized-audio response we will read (~32MB,
// enough for several minutes of speech).
const maxTTSResponseBytes = 32 << 20

// ErrNotConfigured is returned when no API key is set.
var ErrNotConfigured = errors.New("gemini: API key is not configured")

// Client calls the Gemini generateContent endpoint.
type Client struct {
	apiKey   string
	model    string
	ttsModel string
	http     *http.Client
}

// New returns a Gemini client. The model defaults to "gemini-2.5-flash" and the
// text-to-speech model to "gemini-2.5-flash-preview-tts" when empty. An empty
// apiKey yields a client whose calls return ErrNotConfigured.
func New(apiKey, model, ttsModel string) *Client {
	if strings.TrimSpace(model) == "" {
		model = "gemini-2.5-flash"
	}
	if strings.TrimSpace(ttsModel) == "" {
		ttsModel = "gemini-2.5-flash-preview-tts"
	}
	return &Client{
		apiKey:   strings.TrimSpace(apiKey),
		model:    model,
		ttsModel: ttsModel,
		http:     &http.Client{Timeout: 60 * time.Second},
	}
}

// Configured reports whether an API key is present.
func (c *Client) Configured() bool { return c.apiKey != "" }

// --- request/response wire types ---

type genRequest struct {
	Contents []content `json:"contents"`
}

type content struct {
	Role  string `json:"role,omitempty"`
	Parts []part `json:"parts"`
}

type part struct {
	Text       string      `json:"text,omitempty"`
	InlineData *inlineData `json:"inline_data,omitempty"`
}

type inlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type genResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	PromptFeedback struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
}

// --- text-to-speech wire types ---

type ttsRequest struct {
	Contents         []content           `json:"contents"`
	GenerationConfig ttsGenerationConfig `json:"generationConfig"`
}

type ttsGenerationConfig struct {
	ResponseModalities []string        `json:"responseModalities"`
	SpeechConfig       ttsSpeechConfig `json:"speechConfig"`
}

type ttsSpeechConfig struct {
	VoiceConfig ttsVoiceConfig `json:"voiceConfig"`
}

type ttsVoiceConfig struct {
	PrebuiltVoiceConfig ttsPrebuiltVoiceConfig `json:"prebuiltVoiceConfig"`
}

type ttsPrebuiltVoiceConfig struct {
	VoiceName string `json:"voiceName"`
}

// ttsResponse mirrors the audio-bearing generateContent envelope. The API
// returns camelCase field names, so inlineData/mimeType differ from the
// snake_case request tags on inlineData above.
type ttsResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				InlineData struct {
					MimeType string `json:"mimeType"`
					Data     string `json:"data"`
				} `json:"inlineData"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	PromptFeedback struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
}

// Transcribe returns a verbatim transcript of the speech in the given audio.
func (c *Client) Transcribe(ctx context.Context, audio []byte, mimeType string) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	if mimeType == "" {
		mimeType = "audio/mp4"
	}

	reqBody := genRequest{
		Contents: []content{{
			Role: "user",
			Parts: []part{
				{Text: "Generate a verbatim transcript of the speech in this audio. Return only the transcript text, with natural punctuation and no commentary."},
				{InlineData: &inlineData{
					MimeType: mimeType,
					Data:     base64.StdEncoding.EncodeToString(audio),
				}},
			},
		}},
	}

	resp, err := c.generate(ctx, reqBody)
	if err != nil {
		return "", err
	}
	text := collectText(resp)
	if text == "" {
		return "", errors.New("gemini: empty transcript in response")
	}
	return text, nil
}

// GenerateInsight asks Gemini to summarize the given entries into a digest for
// the period ("weekly"|"monthly"). It returns a parsed InsightDigest. Callers
// should fall back to a stored/canned digest if this returns an error.
func (c *Client) GenerateInsight(ctx context.Context, period string, entries []model.JournalEntry) (model.InsightDigest, error) {
	if !c.Configured() {
		return model.InsightDigest{}, ErrNotConfigured
	}
	if period != "weekly" && period != "monthly" {
		period = "weekly"
	}

	var b strings.Builder
	for _, e := range entries {
		body := e.Text
		if body == "" {
			body = e.Transcript
		}
		body = strings.TrimSpace(body)
		if body == "" {
			continue
		}
		fmt.Fprintf(&b, "- (%s) %s\n", e.CreatedAt, body)
	}
	entriesText := b.String()
	if strings.TrimSpace(entriesText) == "" {
		return model.InsightDigest{}, errors.New("gemini: no entry text to analyze")
	}

	prompt := fmt.Sprintf(`You are a gentle, encouraging companion inside a calm, private journaling app called Still. Read the person's %s journal entries and reflect them back with warmth.

Tone: polite, kind, and quietly motivating — never clinical or judgmental, no diagnoses, no emojis. Address the person as "you". Stay grounded in what they actually wrote: celebrate small wins and be gentle about the hard days. Leave them feeling seen and encouraged.

Return ONLY a JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "periodLabel": string,
  "summary": string,
  "patterns": [string],
  "emotionalTone": string,
  "recommendations": [string],
  "suggestedPrompt": string
}

Guidance for each field:
- periodLabel: a short label like "This week" or the month and year.
- summary: 2-3 warm sentences reflecting the period as a whole.
- patterns: 2-4 gentle observations about recurring themes or rhythms you notice.
- emotionalTone: a short, kind phrase, e.g. "Calm, quietly hopeful".
- recommendations: 1-3 encouraging invitations (offer them softly, never as commands).
- suggestedPrompt: one inviting question to write about next.

Entries:
%s`, period, entriesText)

	reqBody := genRequest{
		Contents: []content{{
			Role:  "user",
			Parts: []part{{Text: prompt}},
		}},
	}

	resp, err := c.generate(ctx, reqBody)
	if err != nil {
		return model.InsightDigest{}, err
	}
	raw := stripJSONFences(collectText(resp))
	if raw == "" {
		return model.InsightDigest{}, errors.New("gemini: empty insight response")
	}

	var parsed struct {
		PeriodLabel     string   `json:"periodLabel"`
		Summary         string   `json:"summary"`
		Patterns        []string `json:"patterns"`
		EmotionalTone   string   `json:"emotionalTone"`
		Recommendations []string `json:"recommendations"`
		SuggestedPrompt string   `json:"suggestedPrompt"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return model.InsightDigest{}, fmt.Errorf("gemini: parse insight JSON: %w", err)
	}

	digest := model.InsightDigest{
		ID:              "insight-" + period,
		PeriodType:      period,
		PeriodLabel:     parsed.PeriodLabel,
		Summary:         parsed.Summary,
		Patterns:        nonNil(parsed.Patterns),
		EmotionalTone:   parsed.EmotionalTone,
		Recommendations: nonNil(parsed.Recommendations),
		SuggestedPrompt: parsed.SuggestedPrompt,
		RelatedEntryIds: relatedIDs(entries),
	}
	return digest, nil
}

// Synthesize converts text to spoken audio using the Gemini text-to-speech
// model. It returns the audio wrapped in a standard WAV (RIFF/WAVE) container
// and the "audio/wav" MIME type. voiceName defaults to "Kore" when empty. It
// returns ErrNotConfigured when no API key is set.
func (c *Client) Synthesize(ctx context.Context, text, voiceName string) (wav []byte, mimeType string, err error) {
	if !c.Configured() {
		return nil, "", ErrNotConfigured
	}
	if strings.TrimSpace(voiceName) == "" {
		voiceName = "Kore"
	}

	reqBody := ttsRequest{
		Contents: []content{{Parts: []part{{Text: text}}}},
		GenerationConfig: ttsGenerationConfig{
			ResponseModalities: []string{"AUDIO"},
			SpeechConfig: ttsSpeechConfig{
				VoiceConfig: ttsVoiceConfig{
					PrebuiltVoiceConfig: ttsPrebuiltVoiceConfig{VoiceName: voiceName},
				},
			},
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, "", fmt.Errorf("gemini: marshal TTS request: %w", err)
	}

	endpoint := fmt.Sprintf("%s/%s:generateContent?key=%s", apiBase, c.ttsModel, neturl.QueryEscape(c.apiKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, "", fmt.Errorf("gemini: build TTS request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("gemini: TTS request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxTTSResponseBytes))
	if err != nil {
		return nil, "", fmt.Errorf("gemini: read TTS response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("gemini: unexpected TTS status %d: %s", resp.StatusCode, truncate(string(respBytes), 300))
	}

	var out ttsResponse
	if err := json.Unmarshal(respBytes, &out); err != nil {
		return nil, "", fmt.Errorf("gemini: decode TTS response: %w", err)
	}
	if len(out.Candidates) == 0 {
		if reason := out.PromptFeedback.BlockReason; reason != "" {
			return nil, "", fmt.Errorf("gemini: no TTS candidates (blocked: %s)", reason)
		}
		return nil, "", errors.New("gemini: no candidates in TTS response")
	}

	var data, audioMime string
	for _, p := range out.Candidates[0].Content.Parts {
		if p.InlineData.Data != "" {
			data = p.InlineData.Data
			audioMime = p.InlineData.MimeType
			break
		}
	}
	if data == "" {
		return nil, "", errors.New("gemini: no audio data in TTS response")
	}

	pcm, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, "", fmt.Errorf("gemini: decode TTS audio: %w", err)
	}

	return pcmToWAV(pcm, sampleRateFromMime(audioMime)), "audio/wav", nil
}

// generate posts the request and decodes the response envelope.
func (c *Client) generate(ctx context.Context, body genRequest) (genResponse, error) {
	var out genResponse

	payload, err := json.Marshal(body)
	if err != nil {
		return out, fmt.Errorf("gemini: marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/%s:generateContent", apiBase, c.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return out, fmt.Errorf("gemini: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return out, fmt.Errorf("gemini: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return out, fmt.Errorf("gemini: read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return out, fmt.Errorf("gemini: unexpected status %d: %s", resp.StatusCode, truncate(string(respBytes), 300))
	}

	if err := json.Unmarshal(respBytes, &out); err != nil {
		return out, fmt.Errorf("gemini: decode response: %w", err)
	}
	if len(out.Candidates) == 0 {
		reason := out.PromptFeedback.BlockReason
		if reason != "" {
			return out, fmt.Errorf("gemini: no candidates (blocked: %s)", reason)
		}
		return out, errors.New("gemini: no candidates in response")
	}
	return out, nil
}

// collectText concatenates all text parts of the first candidate, trimmed.
func collectText(resp genResponse) string {
	if len(resp.Candidates) == 0 {
		return ""
	}
	var b strings.Builder
	for _, p := range resp.Candidates[0].Content.Parts {
		b.WriteString(p.Text)
	}
	return strings.TrimSpace(b.String())
}

// stripJSONFences removes ```json ... ``` fences a model may wrap JSON in.
func stripJSONFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimPrefix(s, "json")
	s = strings.TrimPrefix(s, "JSON")
	if i := strings.LastIndex(s, "```"); i >= 0 {
		s = s[:i]
	}
	return strings.TrimSpace(s)
}

func relatedIDs(entries []model.JournalEntry) []string {
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.ID != "" {
			ids = append(ids, e.ID)
		}
	}
	return ids
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// sampleRateFromMime extracts the sample rate from a mime type such as
// "audio/L16;codec=pcm;rate=24000", defaulting to 24000 when absent.
func sampleRateFromMime(mimeType string) int {
	const def = 24000
	for _, field := range strings.Split(mimeType, ";") {
		if rate, ok := strings.CutPrefix(strings.TrimSpace(field), "rate="); ok {
			if n, err := strconv.Atoi(strings.TrimSpace(rate)); err == nil && n > 0 {
				return n
			}
		}
	}
	return def
}

// pcmToWAV wraps raw signed 16-bit little-endian mono PCM in a standard 44-byte
// RIFF/WAVE header and returns the complete WAV file bytes.
func pcmToWAV(pcm []byte, sampleRate int) []byte {
	const (
		numChannels   = 1
		bitsPerSample = 16
	)
	if sampleRate <= 0 {
		sampleRate = 24000
	}
	blockAlign := numChannels * bitsPerSample / 8
	byteRate := sampleRate * blockAlign
	dataSize := len(pcm)

	buf := make([]byte, 0, 44+dataSize)
	buf = append(buf, "RIFF"...)
	buf = binary.LittleEndian.AppendUint32(buf, uint32(36+dataSize)) // RIFF chunk size
	buf = append(buf, "WAVE"...)
	buf = append(buf, "fmt "...)
	buf = binary.LittleEndian.AppendUint32(buf, 16)                  // PCM fmt chunk size
	buf = binary.LittleEndian.AppendUint16(buf, 1)                   // audio format: PCM
	buf = binary.LittleEndian.AppendUint16(buf, numChannels)
	buf = binary.LittleEndian.AppendUint32(buf, uint32(sampleRate))
	buf = binary.LittleEndian.AppendUint32(buf, uint32(byteRate))
	buf = binary.LittleEndian.AppendUint16(buf, uint16(blockAlign))
	buf = binary.LittleEndian.AppendUint16(buf, bitsPerSample)
	buf = append(buf, "data"...)
	buf = binary.LittleEndian.AppendUint32(buf, uint32(dataSize)) // data chunk size
	buf = append(buf, pcm...)
	return buf
}
