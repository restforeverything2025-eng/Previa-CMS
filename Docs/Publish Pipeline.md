# PREVIA Publish Pipeline

Version: 2.0

Status: Production

---

# Purpose

This document describes the complete publication process of PREVIA CMS.

The pipeline is deterministic.

Every publication always follows the same sequence.

No service may change the execution order without architectural review.

---

# Pipeline Overview

```
Read Products
      │
      ▼
Reset Publish Report
      │
      ▼
New Products?
 ┌────┴────┐
 │         │
No        Yes
 │         │
 ▼         ▼
Publish    ID Generator
data.js         │
 │              ▼
 │        SKU Generator
 │              │
 │              ▼
 │        Normalizer
 │              │
 │              ▼
 │   Incoming Validation
 │              │
 │              ▼
 │   Catalog Validation
 │              │
 │              ▼
 │ Prepare Product Folders
 │              │
 │              ▼
 │   Image Validation
 │              │
 │              ▼
 └────────► Generate data.js
                    │
                    ▼
      Write Generated Fields
                    │
                    ▼
         Cleanup Incoming
                    │
                    ▼
         Publish Report
```

---

# Step 1

Read catalog from Google Sheets.

Service:

Products

Output:

products[]

---

# Step 2

Reset publication report.

Service:

PublishReport

Purpose:

Start a clean publication log.

---

# Step 3

Determine whether new products exist.

Service:

IncomingValidator

Two execution branches exist.

---

# Branch A

No New Products

Pipeline:

Publish data.js

↓

Show report

↓

Finish

No Google Drive operations occur.

No IDs or SKUs are generated.

---

# Branch B

New Products

Complete pipeline:

Assign IDs

↓

Assign SKUs

↓

Normalize data

↓

Validate Incoming

↓

Validate Catalog

↓

Create Product Folders

↓

Validate Images

↓

Generate data.js

↓

Write IDs and SKUs

↓

Cleanup Incoming

↓

Show report

---

# Publish Report

Every important step is recorded.

Example:

✓ IDs assigned

✓ SKUs assigned

✓ Validation completed

✓ data.js updated

✓ Google Sheets updated

✓ Incoming cleaned

✓ Publication completed

---

# Failure Behaviour

The pipeline stops immediately on the first error.

Examples:

Validation error

↓

Pipeline stops.

Missing images

↓

Pipeline stops.

Duplicate SKU

↓

Pipeline stops.

Nothing is published after a failure.

---

# Atomic Philosophy

Publication is treated as one logical operation.

Either:

Everything succeeds

or

Publication stops immediately.

Partial publication is never considered successful.

---

# Why This Pipeline Exists

The pipeline guarantees:

- predictable publication
- reproducible results
- safe validation
- automatic recovery
- simple debugging

---

# Future Extensions

Possible future stages:

- automatic backup
- publication statistics
- rollback support
- publication history

The execution order should remain unchanged.