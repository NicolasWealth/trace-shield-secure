# TraceShield Foundation

Build the initial MVP foundation for a web application called TraceShield.

TraceShield is a supply-chain recall intelligence platform. It helps food manufacturers and supply-chain operators investigate contamination incidents by mapping batch custody, calculating exposure risk and evidence confidence, and preparing targeted recall actions.

For this first build, focus ONLY on the functional Web2 MVP foundation. Do NOT implement blockchain, smart contracts, wallets, Gemini, AI APIs, tokens, NFTs, or Web3 functionality yet. We will implement those later in Antigravity.

Tech stack

React

TypeScript

Vite

Tailwind CSS

shadcn/ui

Firebase

Cloud Firestore

React Flow

Product requirements

Create a professional desktop-first application with a clean enterprise food-safety/security aesthetic.

Create these routes:

/login

/dashboard

/batches

/batches/:id

/supply-chain

/incidents

/incidents/:id

/verification

Create a persistent application sidebar with:

TraceShield logo/name

Dashboard

Batches

Supply Chain

Recall Incidents

Verification

Settings

User profile/logout

Dashboard

Show:

Total active batches

Supply-chain events

Open recall incidents

High-risk locations

Recent activity

Active incidents

Quick action buttons

Use real Firestore data when available. Do not make the application dependent on hardcoded dashboard statistics.

Batch management

Create a batch management interface.

A batch must contain:

batchId

productName

quantity

productionDate

expiryDate

origin

organizationId

status

createdAt

Support:

creating a batch

viewing batches

searching batches

filtering batches

opening batch details

Batch details

Display:

batch information

current status

quantity

production and expiry dates

origin

custody timeline

connected supply-chain participants

connected custody events

Include an action to record a custody event.

A custody event must contain:

eventId

batchId

type

fromOrganization

toOrganization

location

quantity

timestamp

previousEventId

eventHash

blockchainTxHash

verificationStatus

For this first version, eventHash, blockchainTxHash, and blockchain verification values should remain empty or clearly marked as pending integration. Do not fake blockchain data.

Supply-chain graph

Use React Flow.

Display relationships between:

Manufacturer

Distributor

Warehouse

Retailer

Batch

Allow the user to select a node and inspect its associated information.

Build the graph from Firestore batch and custody-event data where possible.

Recall incidents

Create an incident management interface.

An incident must contain:

incidentId

batchId

type

description

status

createdAt

createdBy

Support:

creating an incident

viewing incidents

filtering by status

opening an incident

Incident analysis

Create an incident analysis page.

The page must display:

contaminated batch

affected locations

affected quantities

exposure risk

evidence confidence

priority

reasons

recommended action

For this MVP, implement a transparent deterministic scoring engine, not AI.

Use the following priority rules:

exposure risk >= 80 AND evidence confidence >= 80 → IMMEDIATE RECALL

exposure risk >= 80 AND evidence confidence < 80 → URGENT INVESTIGATION

exposure risk < 80 AND evidence confidence >= 80 → MONITOR

exposure risk < 80 AND evidence confidence < 80 → VERIFY EVIDENCE

Keep the scoring logic isolated in a dedicated service/module so it can later be replaced or extended.

Verification page

Create the verification interface now, but do NOT implement blockchain verification.

Show:

event ID

event status

event hash

blockchain transaction hash

verification status

Clearly distinguish between:

Pending blockchain integration

and

Verified

Never display fake transaction hashes or fake blockchain confirmations.

Firebase

Structure Firestore around:

users
organizations
batches
events
incidents
analyses

Create clean TypeScript types/interfaces for these entities.

Keep Firebase configuration isolated in a dedicated configuration module.

Use environment variables for Firebase configuration.

Do not expose secrets in source code.

Demo data

Create a seed/demo-data mechanism rather than scattering hardcoded records throughout UI components.

The demo network should represent:

Manufacturer A
→ Distributor Lagos
→ Retailer Ikeja
→ Retailer Lekki

and

Manufacturer A
→ Distributor Abuja
→ Retailer Wuse
→ Retailer Garki

Create several realistic batches and custody events.

The demo data must be clearly identifiable as demonstration data.

Code quality

Use reusable components.

Keep business logic separate from UI components.

Create a clear folder structure for:

components

pages

services

types

hooks

utilities

Firebase configuration

Do not add unnecessary dependencies.

Do not implement features outside this specification.

The project must run locally after generation.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cf74897d-0182-4f01-9c69-6ed9fffc7fde).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
