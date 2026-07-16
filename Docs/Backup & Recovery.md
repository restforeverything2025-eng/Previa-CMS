# PREVIA Backup & Recovery

Version: 2.0

Status: Production

---

# Purpose

This document describes how to completely restore PREVIA after hardware failure,
computer replacement,
or accidental data loss.

Following this guide should allow restoring the complete system in less than one hour.

---

# What Must Be Backed Up

PREVIA consists of five independent parts.

1.

Google Sheets

↓

Business Data

2.

Google Drive

↓

Product Images

3.

Google Apps Script

↓

CMS Source Code

4.

GitHub

↓

Frontend

↓

CMS Repository

5.

Documentation

↓

Project Bible

---

# Recovery Order

Always restore components in this order.

Google Account

↓

GitHub

↓

Google Sheets

↓

Google Drive

↓

Apps Script

↓

Frontend

↓

Documentation

---

# GitHub Recovery

Repositories:

Previa-Vintage-App

Previa-CMS

Clone:

git clone ...

Verify:

git status

Working tree clean

---

# Apps Script Recovery

Install:

Node.js

↓

npm

↓

clasp

Login:

clasp login

Clone project:

clasp clone SCRIPT_ID

Verify:

clasp status

Upload:

clasp push

---

# Google Drive Recovery

Verify:

Products Folder

Incoming Folder

Images

Folder names

Every folder name must match product SKU.

---

# Google Sheets Recovery

Verify:

Products Sheet

Config Sheet

Generated fields

Configuration values

---

# Configuration Verification

Verify:

Products Folder ID

Incoming Folder ID

GitHub Owner

GitHub Repository

GitHub Branch

GitHub Token

Exchange Rate API

---

# Frontend Recovery

Verify:

data.js

media-manifest.json

images/

GitHub Pages

---

# Functional Tests

Run:

Publish Boutique

↓

Refresh Media

↓

Open Website

↓

Verify Product

↓

Verify Images

---

# Success Criteria

Recovery is complete when:

Publish succeeds

↓

Website works

↓

Images load

↓

GitHub updated

↓

Google Sheets synchronized

---

# Long-Term Backup Strategy

Maintain:

GitHub repositories

↓

Apps Script

↓

Google Sheets

↓

Google Drive

↓

Documentation

No component should exist without backup.

---

# Disaster Recovery Rule

The PREVIA project must never depend on one computer.

Any authorized developer should be able to restore the entire system using this document.