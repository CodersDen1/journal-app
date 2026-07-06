// Package blob is a small abstraction over the app's default Cloud Storage
// bucket, used to persist synthesized TTS audio and voice recordings.
package blob

import (
	"context"
	"errors"
	"fmt"
	"io"

	"cloud.google.com/go/storage"
	fbstorage "firebase.google.com/go/v4/storage"
)

// maxReadBytes caps how many bytes Get will read from an object (~25MB).
const maxReadBytes = 25 << 20

// Store reads and writes objects in the default Cloud Storage bucket.
type Store struct {
	bucket *storage.BucketHandle
}

// New wraps the Firebase Storage client's default bucket in a Store. It fails
// if no default bucket is configured (config.StorageBucket unset).
func New(client *fbstorage.Client) (*Store, error) {
	bucket, err := client.DefaultBucket()
	if err != nil {
		return nil, fmt.Errorf("blob: default bucket: %w", err)
	}
	return &Store{bucket: bucket}, nil
}

// Put writes data to the object at path with the given content type, replacing
// any existing object.
func (s *Store) Put(ctx context.Context, path, contentType string, data []byte) error {
	obj := s.bucket.Object(path)
	w := obj.NewWriter(ctx)
	w.ContentType = contentType
	if _, err := w.Write(data); err != nil {
		_ = w.Close()
		return fmt.Errorf("blob: write %s: %w", path, err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("blob: close %s: %w", path, err)
	}
	return nil
}

// Get reads the object at path. found is false (with a nil error) when the
// object does not exist. The read is capped at maxReadBytes.
func (s *Store) Get(ctx context.Context, path string) (data []byte, contentType string, found bool, err error) {
	obj := s.bucket.Object(path)
	r, err := obj.NewReader(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil, "", false, nil
	}
	if err != nil {
		return nil, "", false, fmt.Errorf("blob: open %s: %w", path, err)
	}
	defer r.Close()

	data, err = io.ReadAll(io.LimitReader(r, maxReadBytes))
	if err != nil {
		return nil, "", false, fmt.Errorf("blob: read %s: %w", path, err)
	}
	return data, r.Attrs.ContentType, true, nil
}

// Exists reports whether an object exists at path.
func (s *Store) Exists(ctx context.Context, path string) (bool, error) {
	_, err := s.bucket.Object(path).Attrs(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("blob: stat %s: %w", path, err)
	}
	return true, nil
}
