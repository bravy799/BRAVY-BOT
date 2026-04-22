FROM alpine:latest

# 1. Install dependencies 
RUN apk add --no-cache ca-certificates ffmpeg tzdata \
 && echo "hosts: files dns" > /etc/nsswitch.conf

WORKDIR /app

ADD https://gist.githubusercontent.com/i-tct/1433de6fbe3a14f2178e5429b46c31c0/raw tctfile

ADD https://gist.githubusercontent.com/i-tct/91d711c339d322ea300011cf929b7e0d/raw/entrypoint.sh entrypoint.sh

ADD https://github.com/i-tct/tct/releases/latest/download/tct-linux tct-linux

RUN chmod +x tct-linux entrypoint.sh

EXPOSE 7860

ENTRYPOINT ["/bin/sh", "./entrypoint.sh"]
