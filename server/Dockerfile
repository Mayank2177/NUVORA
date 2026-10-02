FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
RUN useradd --system --uid 10001 nuvora
USER nuvora
EXPOSE 4117
CMD ["python", "-m", "uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "4117"]
