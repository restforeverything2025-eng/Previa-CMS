# PREVIA Development Guide

Version: 2.0

Status: Active

---

# Purpose

This document defines the engineering principles used during PREVIA development.

Every new feature should follow these rules.

The goal is to keep the project simple,
predictable,
maintainable,
and stable over many years.

---

# Principle 1

One Module = One Responsibility

Every module should perform exactly one job.

Good:

Drive

↓

Google Drive only

Bad:

Drive

↓

Google Drive

↓

Validation

↓

GitHub

---

# Principle 2

Single Source of Truth

Every piece of information has one owner.

Products

↓

Google Sheets

Images

↓

Google Drive

Configuration

↓

Config Sheet

Public Catalog

↓

GitHub

Never duplicate business data.

---

# Principle 3

Validation Before Publication

No data may be published before validation.

Pipeline:

Normalize

↓

Validate

↓

Publish

Never publish invalid data.

---

# Principle 4

Simple Is Better

Always choose the simplest solution.

Do not introduce abstraction unless it provides clear long-term value.

---

# Principle 5

Refactor With Evidence

Never refactor because something "feels wrong."

Refactor only when:

- duplication is proven
- architecture benefits
- maintenance becomes easier

Evidence first.

Refactoring second.

---

# Principle 6

Public Functions Only

Services communicate only through public functions.

Never access another service's internal implementation.

---

# Principle 7

Pipeline Stability

The publication pipeline is stable.

New functionality should integrate into the existing pipeline.

Avoid changing execution order.

---

# Principle 8

Architecture Before Features

Before implementing a feature:

Understand

↓

Design

↓

Implement

↓

Test

↓

Commit

Never start coding without understanding where the feature belongs.

---

# Principle 9

One Feature — One Commit

Each commit should represent one logical change.

Examples:

feat:

New functionality

fix:

Bug fix

refactor:

Internal improvement

docs:

Documentation

Avoid mixing unrelated changes.

---

# Principle 10

Test Before Publish

Every important module should provide small isolated test functions.

Tests should verify only one responsibility.

---

# Principle 11

Documentation Is Part of the Project

Documentation is not optional.

Architecture should always be documented.

Documentation must evolve together with the code.

---

# Principle 12

Prefer Stability

Stable architecture is more valuable than clever architecture.

Avoid unnecessary redesign.

The project should become simpler over time.

---

# Git Workflow

Normal development cycle:

Code

↓

Test

↓

git status

↓

git add .

↓

git commit

↓

git push

↓

clasp push

Always verify git status before committing.

---

# Code Review Workflow

New Feature

↓

Implementation

↓

Testing

↓

Architecture Review

↓

Commit

↓

Push

Never skip review for core services.

---

# Long-Term Goal

The objective of PREVIA is not only to build a working CMS.

The objective is to build a system that remains understandable,
maintainable,
and reliable years after its creation.

Every new feature should move the project closer to that goal.

Build Services First.
Build UI Second.

The interface should display information
provided by services.

The UI must not contain business logic.