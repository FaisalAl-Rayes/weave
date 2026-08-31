# Contributing to Weave

Thank you for your interest in contributing!

## Getting started

1. Fork the repository and clone it locally
2. Copy `.env.example` to `.env` and fill in your values
3. Run `docker compose up -d` to start the development server
4. The app runs at `http://localhost:3333`

## Schema-first development

Weave is schema-driven. Most behaviour is controlled by the YAML schema in `schemas/<project>.schema.yaml`. Before adding code, consider whether the change can be expressed in the schema.

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Run `npm run lint` before submitting
- TypeScript types must pass: `npx tsc --noEmit`

## Reporting issues

Use GitHub Issues. Include your schema snippet and the query/seed that reproduces the problem.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
