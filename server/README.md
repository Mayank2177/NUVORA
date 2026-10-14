# NUVORA backend

FastAPI service for the NUVORA application. Install the project dependencies and
run the API from this directory with `python -m uvicorn src.api.app:app`.
Packaged imports and console entry points use the `src` namespace.

Password reset mail uses Gmail SMTP (`nuvora9ev@gmail.com`). Set
`NUVORA_SMTP_PASSWORD` to that account's Google App Password in the project-root
`.env` or the server process environment; do not use the normal Google account password.
Without SMTP credentials, reset mail is rejected and its token is not logged.
# Background workers

Set `NUVORA_RATE_LIMIT_REDIS_URL` for both the API and worker. Run the worker
alongside the API with `python -m src.workers.worker`; Docker Compose starts it
as a separate `worker` service. Jobs use Redis Streams and can be retried after
worker restarts. GitHub sync now returns a `jobId`; poll `GET /api/jobs/{jobId}`
for its status. Cleanup and analytics aggregation are scheduled hourly.
