# NUVORA

NUVORA is a platform that helps people bridge the gap between learning and doing by turning knowledge and ideas into practical skills, real-world projects, and meaningful opportunities.

It is designed to help early-career developers and aspiring builders turn evidence of work into career opportunities by connecting skills, projects, code contributions, and real-world problem solving.

## Why NUVORA?

Many talented developers struggle because they lack visible proof of capability. NUVORA helps surface that proof by supporting:

- portfolio-style project tracking
- evidence-backed skill validation
- technical opportunity matching
- developer growth through real-world project experience

## Product vision

NUVORA transforms learning into action by helping users:

- document skills and project work
- showcase code and practical achievements
- discover opportunities based on demonstrated capability
- connect learning, building, and career momentum

## Tech stack

This repository contains both the frontend and backend services for the platform:

- Frontend: Next.js + React + TypeScript
- Backend: FastAPI + Python
- Styling: Tailwind CSS
- Runtime tooling: Node.js and Python ecosystems

## Repository structure

```text
NUVORA/
├── client/                 # Next.js frontend application
│   ├── app/                # App router pages
│   ├── components/        # Reusable UI components
│   ├── lib/               # Shared utilities and helpers
│   ├── public/            # Static assets
│   ├── package.json       # Frontend scripts and dependencies
│   ├── next.config.ts     # Next.js config
│   └── README.md          # Client-specific documentation
├── server/                 # FastAPI backend service
│   ├── src/               # Application source code
│   ├── .env.example       # Sample environment configuration
│   ├── pyproject.toml     # Python project configuration
│   ├── requirements.txt   # Python dependencies
│   ├── Dockerfile         # Container definition
│   ├── compose.yaml       # Service orchestration
│   └── README.md          # Backend documentation
├── LICENSE                 # Project license information
├── README.md              # Project overview (this file)
└── .gitignore             # Repository ignore rules
```

## Getting started

### Frontend

From the root project directory:

```bash
cd client
npm install
npm run dev
```

The app will start in development mode using Next.js.

### Backend

From the root project directory:

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then copy the example environment file and configure your local values:

```bash
cp .env.example .env
```

Start the API server:

```bash
python -m uvicorn src.api.app:app --reload
```

For more backend details, including deployment and worker configuration, see `server/README.md`.

## Environment and configuration

The server includes an `.env.example` file for required configuration values such as:

- database connection settings
- email / SMTP configuration
- Redis integration
- application secrets

Make sure to configure the environment before running the backend in a local or deployment environment.


## More information

- Client app: `client/`
- Backend service: `server/`
- Client docs: `client/README.md`
- Backend docs: `server/README.md`

NUVORA is built to help people move from learning to doing by turning potential into visible, practical, and career-relevant outcomes.
