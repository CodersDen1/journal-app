// Package firebaseapp initializes the Firebase Admin SDK and exposes helpers
// for the Auth and Firestore clients.
package firebaseapp

import (
	"context"
	"fmt"
	"strings"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"firebase.google.com/go/v4/storage"
	"google.golang.org/api/option"

	"still/server/internal/config"
)

// App wraps a *firebase.App and its resolved project id.
type App struct {
	app *firebase.App
}

// New builds a Firebase app from the given config. Credentials are resolved in
// this order: inline service account JSON, service account file, then
// Application Default Credentials.
func New(ctx context.Context, cfg config.Config) (*App, error) {
	fbConfig := &firebase.Config{ProjectID: cfg.ProjectID, StorageBucket: cfg.StorageBucket}

	var opts []option.ClientOption
	switch {
	case strings.TrimSpace(cfg.CredentialsJSON) != "":
		opts = append(opts, option.WithCredentialsJSON([]byte(cfg.CredentialsJSON)))
	case strings.TrimSpace(cfg.CredentialsFile) != "":
		opts = append(opts, option.WithCredentialsFile(cfg.CredentialsFile))
	default:
		// No explicit credentials: fall back to Application Default Credentials.
	}

	app, err := firebase.NewApp(ctx, fbConfig, opts...)
	if err != nil {
		return nil, fmt.Errorf("firebaseapp: init: %w", err)
	}
	return &App{app: app}, nil
}

// Auth returns the Firebase Auth client (for verifying ID tokens).
func (a *App) Auth(ctx context.Context) (*auth.Client, error) {
	client, err := a.app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebaseapp: auth client: %w", err)
	}
	return client, nil
}

// Firestore returns a Firestore client. The caller owns closing it.
func (a *App) Firestore(ctx context.Context) (*firestore.Client, error) {
	client, err := a.app.Firestore(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebaseapp: firestore client: %w", err)
	}
	return client, nil
}

// Storage returns a Cloud Storage client bound to the app's default bucket
// (set via config.StorageBucket).
func (a *App) Storage(ctx context.Context) (*storage.Client, error) {
	client, err := a.app.Storage(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebaseapp: storage client: %w", err)
	}
	return client, nil
}
