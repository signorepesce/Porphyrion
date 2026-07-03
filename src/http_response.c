#include "http_response.h"
#include <assert.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#define SEND_MAX_CHUNKS (64 * 1024 * 1024)
#define SERVE_MAX_CHUNKS (64 * 1024 * 1024)

int send_all(int sock, const char *buf, size_t len)
{
    assert(buf != NULL);
    size_t sent = 0;
    int guard = 0;
    while (sent < len && guard < SEND_MAX_CHUNKS)
    {
        ssize_t w = send(sock, buf + sent, len - sent, 0);
        if (w <= 0)
        {
            return -1;
        }
        sent += (size_t)w;
        guard++;
    }
    return (sent == len) ? 0 : -1;
}

void serve_file(int sock, const char *path, const char *ct)
{
    assert(path != NULL);
    assert(ct != NULL);
    int fd = open(path, O_RDONLY);
    if (fd < 0)
    {
        const char *nf = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        (void)send_all(sock, nf, strlen(nf));
        return;
    }
    struct stat st;
    if (fstat(fd, &st) < 0)
    {
        (void)close(fd);
        const char *err =
            "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n";
        (void)send_all(sock, err, strlen(err));
        return;
    }
    char hdr[256];
    (void)snprintf(
        hdr, sizeof(hdr),
        "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %lld\r\n\r\n",
        ct, (long long)st.st_size);
    if (send_all(sock, hdr, strlen(hdr)) != 0)
    {
        (void)close(fd);
        return;
    }
    char buf[4096];
    int chunks = 0;
    ssize_t n;
    while ((n = read(fd, buf, sizeof(buf))) > 0 && chunks < SERVE_MAX_CHUNKS)
    {
        if (send_all(sock, buf, (size_t)n) != 0)
        {
            break;
        }
        chunks++;
    }
    (void)close(fd);
}

void send_text(int sock, int status, const char *body)
{
    assert(body != NULL);
    char hdr[256];
    (void)snprintf(
        hdr, sizeof(hdr),
        "HTTP/1.1 %d OK\r\nContent-Type: application/json\r\n"
        "Access-Control-Allow-Origin: *\r\nContent-Length: %zu\r\n\r\n",
        status, strlen(body));
    if (send_all(sock, hdr, strlen(hdr)) == 0)
    {
        (void)send_all(sock, body, strlen(body));
    }
}
