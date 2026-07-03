FROM alpine:3.18@sha256:de0eb0b3f2a47ba1eb89389859a9bd88b28e82f5826b6969ad604979713c2d4f AS curlbuilder
RUN --mount=type=cache,target=/var/cache/apk apk add \
    gcc=12.2.1_git20220924-r10 \
    make=4.4.1-r1 \
    musl-dev=1.2.4-r3 \
    pkgconf=1.9.5-r0 \
    perl=5.36.2-r1 \
    mbedtls-static=2.28.10-r0 \
    mbedtls-dev=2.28.10-r0 \
    zlib-static=1.2.13-r1 \
    zlib-dev=1.2.13-r1
WORKDIR /build
ADD --checksum=sha256:7b40ea64947e0b440716a4d7f0b7aa56230a5341c8377d7b609649d4aea8dbcf \
    https://curl.se/download/curl-8.12.1.tar.gz curl.tar.gz
RUN tar xzf curl.tar.gz
WORKDIR /build/curl-8.12.1
RUN ./configure \
        --prefix=/usr \
        --disable-shared --enable-static \
        --with-mbedtls --without-openssl \
        --with-ca-bundle=/etc/ssl/certs/ca-certificates.crt \
        --enable-http --enable-proxy \
        --without-nghttp2 --without-nghttp3 --without-ngtcp2 \
        --without-brotli --without-zstd \
        --without-libidn2 --without-libpsl \
        --without-librtmp --without-libssh2 --without-libssh \
        --disable-ldap --disable-ldaps \
        --disable-ftp --disable-file --disable-dict --disable-gopher \
        --disable-imap --disable-pop3 --disable-smtp --disable-smb \
        --disable-telnet --disable-tftp --disable-rtsp --disable-mqtt \
        --disable-ntlm --disable-manual --disable-unix-sockets \
        --disable-cookies --disable-netrc --disable-alt-svc --disable-hsts \
        --disable-doh --disable-aws --disable-form-api --disable-headers-api \
        --disable-progress-meter \
        CFLAGS="-Os -ffunction-sections -fdata-sections -fno-asynchronous-unwind-tables" \
    && make -j"$(nproc)" && make install

FROM alpine:3.18@sha256:de0eb0b3f2a47ba1eb89389859a9bd88b28e82f5826b6969ad604979713c2d4f AS builder
RUN --mount=type=cache,target=/var/cache/apk apk add \
    gcc=12.2.1_git20220924-r10 \
    make=4.4.1-r1 \
    musl-dev=1.2.4-r3 \
    binutils=2.40-r8 \
    upx=4.0.2-r0 \
    mbedtls-static=2.28.10-r0 \
    zlib-static=1.2.13-r1
COPY --from=curlbuilder /usr/lib/libcurl.a /usr/lib/libcurl.a
COPY --from=curlbuilder /usr/include/curl /usr/include/curl
WORKDIR /app
COPY Makefile ./
COPY src/ src/
COPY include/ include/
ARG PACK=1
RUN --mount=type=cache,target=/app/obj,id=obj-alpine318 \
    make -j"$(nproc)" LDFLAGS="-static -Wl,--gc-sections -lcurl -lmbedtls \
                               -lmbedx509 -lmbedcrypto -lz -lm -pthread -s" && \
    strip --strip-all sam-porter && \
    objcopy --remove-section .eh_frame --remove-section .eh_frame_hdr \
            --remove-section .comment --remove-section .note.gnu.build-id \
            sam-porter && \
    if [ "$PACK" = "1" ]; then upx --best --lzma sam-porter; fi

FROM scratch
LABEL org.opencontainers.image.title="Porphyrion" \
      org.opencontainers.image.description="API client" \
      org.opencontainers.image.version="v0.6" \
      org.opencontainers.image.source="https://github.com/katevaschris/Porphyrion"
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/sam-porter /sam-porter
COPY resources/ resources/
COPY web/ web/
EXPOSE 8099
CMD ["/sam-porter"]
