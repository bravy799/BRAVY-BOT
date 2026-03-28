FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN curl -fsSL https://gist.githubusercontent.com/i-tct/91d711c339d322ea300011cf929b7e0d/raw/entrypoint.sh \
    -o entrypoint.sh \
 && chmod +x entrypoint.sh

EXPOSE 7860

ENTRYPOINT ["./entrypoint.sh"]
