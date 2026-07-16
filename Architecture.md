# PREVIA CMS Architecture

Version: 2.0

Status: Production

---

# Purpose

This document explains the architectural principles of PREVIA CMS.

It describes why the system is designed this way,
how services interact,
and which rules must never be violated.

The goal is to preserve a simple,
predictable,
and maintainable architecture.

---

# Core Principles

## Single Responsibility

Every service has exactly one responsibility.

Examples:

- Products → Product catalog
- Drive → Google Drive
- GitHub → GitHub API
- Validation → Validation
- Publish → Orchestration

A service must never perform work belonging to another service.

---

## Single Source of Truth

Every type of data has only one authoritative source.

Examples:

Products
→ Google Sheets

Images
→ Google Drive

Public Catalog
→ data.js

Repository
→ GitHub

Configuration
→ Config Sheet

---

## Publish Pipeline

Publishing always follows the same sequence.

Products

↓

ID Generator

↓

SKU Generator

↓

Normalizer

↓

Incoming Validation

↓

Catalog Validation

↓

Prepare Product Folders

↓

Image Validation

↓

Generate data.js

↓

Write Generated Fields

↓

Cleanup Incoming

↓

Publication Report

The order of these steps must never change without architectural review.

---

## Service Communication

Services communicate only through public functions.

Example:

Publish

↓

assignSku()

↓

SkuGenerator

Publish never modifies SKU values directly.

---

## No Circular Dependencies

Services may depend only on lower-level services.

Example:

Publish
↓

Validation
↓

Drive

Allowed

Drive
↓

Publish

Forbidden

---

## Data Flow

Google Sheets

↓

Products Service

↓

Business Logic

↓

Data Generator

↓

GitHub

↓

Website

Only one direction.

No service writes data backwards.

---

## Error Handling

Every service reports only its own errors.

Validation reports validation problems.

Drive reports Google Drive problems.

GitHub reports GitHub API problems.

Publish never hides errors.

---

## Testing Philosophy

Every service should provide small isolated test functions.

Tests should verify one responsibility only.

Example:

testSkuCounters()

instead of

testEverything()

---

## Documentation Rule

Documentation explains architecture.

Code explains implementation.

Never duplicate source code inside documentation.

---

# Architecture Goals

The PREVIA CMS architecture is designed to be:

- Simple
- Predictable
- Modular
- Easy to maintain
- Easy to extend
- Easy to debug

---

# Stability Rule

New features must integrate into the existing architecture.

The architecture should not change unless there is a significant long-term benefit.

Stability is preferred over unnecessary refactoring.

---

# PREVIA Philosophy

The project follows one guiding principle:

Simple systems survive.

Complex systems eventually require rewriting.

PREVIA always prefers simplicity.