# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React, with extension CSS and a bundled content script. User requested React.

## Users
Lectio students checking their schedule, assignments, messages, absence and grades.

## Product Purpose
A Firefox extension that revamps Lectio with sidebar navigation and a coherent new design system across its pages.

## Operating Context
Runs on lectio.dk, preserving the existing school session and Lectio's server-rendered data and actions. Authenticated inspection used a session signed into by the user; no session or student records are saved in the project.

## Capabilities and Constraints
Integrate discovered pages and preserve native form controls, uploads, links and postbacks. Package a locally testable Firefox extension. Staff-only workflows remain unconfirmed. No fabricated academic data.

## Evidence on Hand
Public Lectio homepage, school directory and all 13 primary student sections inspected structurally. Compact visual direction approved by the user. Representative synthetic fixtures, seven passing adapter/integration tests and a packaged Firefox development build exist. Live Firefox authenticated actions remain user validation.

## Product Principles
- Keep real student information and actions intact.
- Put daily tasks within reach through persistent navigation.
- Make the extension easy to test and disable.
