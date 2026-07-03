#include "proxy_networking.h"
#include "router.h"
#include <arpa/inet.h>
#include <assert.h>
#include <curl/curl.h>
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#define PORT 8099
#define WORKER_COUNT 8
#define CONN_QUEUE_CAP 64

typedef struct
{
    int fds[CONN_QUEUE_CAP];
    int head;
    int tail;
    int count;
    pthread_mutex_t lock;
    pthread_cond_t not_empty;
} ConnQueue;

static ConnQueue g_queue;

static WorkerCtx *g_workers;

static int queue_push(int fd)
{
    assert(fd >= 0);
    int rc = -1;
    (void)pthread_mutex_lock(&g_queue.lock);
    if (g_queue.count < CONN_QUEUE_CAP)
    {
        g_queue.fds[g_queue.tail] = fd;
        g_queue.tail = (g_queue.tail + 1) % CONN_QUEUE_CAP;
        g_queue.count++;
        (void)pthread_cond_signal(&g_queue.not_empty);
        rc = 0;
    }
    (void)pthread_mutex_unlock(&g_queue.lock);
    return rc;
}

static int queue_pop(void)
{
    (void)pthread_mutex_lock(&g_queue.lock);
    while (g_queue.count == 0)
    {
        (void)pthread_cond_wait(&g_queue.not_empty, &g_queue.lock);
    }
    int fd = g_queue.fds[g_queue.head];
    g_queue.head = (g_queue.head + 1) % CONN_QUEUE_CAP;
    g_queue.count--;
    (void)pthread_mutex_unlock(&g_queue.lock);
    return fd;
}

static void *worker_main(void *arg)
{
    WorkerCtx *ctx = (WorkerCtx *)arg;
    assert(ctx != NULL);
    for (;;)
    {
        int fd = queue_pop();
        handle_client(ctx, fd);
    }
}

static void reject_busy(int fd)
{
    const char *r = "HTTP/1.1 503 Service Unavailable\r\n"
                    "Content-Length: 0\r\nConnection: close\r\n\r\n";
    (void)send(fd, r, strlen(r), MSG_DONTWAIT);
    (void)close(fd);
}

static int start_workers(void)
{
    g_workers = calloc(WORKER_COUNT, sizeof(*g_workers));
    if (!g_workers)
    {
        fprintf(stderr, "worker pool allocation failed\n");
        return -1;
    }
    for (int i = 0; i < WORKER_COUNT; i++)
    {
        if (worker_ctx_init(&g_workers[i]) != 0)
        {
            fprintf(stderr, "worker ctx init failed\n");
            return -1;
        }
    }
    (void)pthread_mutex_init(&g_queue.lock, NULL);
    (void)pthread_cond_init(&g_queue.not_empty, NULL);
    g_queue.head = 0;
    g_queue.tail = 0;
    g_queue.count = 0;
    for (int i = 0; i < WORKER_COUNT; i++)
    {
        pthread_t tid;
        if (pthread_create(&tid, NULL, worker_main, &g_workers[i]) != 0)
        {
            fprintf(stderr, "worker thread creation failed\n");
            return -1;
        }
        (void)pthread_detach(tid);
    }
    return 0;
}

int main(void)
{
    int server_fd;
    struct sockaddr_in addr;
    socklen_t addrlen = sizeof(addr);

#ifdef SIGPIPE
    (void)signal(SIGPIPE, SIG_IGN);
#endif

    if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK)
    {
        fprintf(stderr, "curl_global_init failed\n");
        return 1;
    }

    resolve_url_init();

    if (start_workers() != 0)
    {
        return 1;
    }

    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0)
    {
        perror("socket");
        return 1;
    }

    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0)
    {
        perror("setsockopt");
        (void)close(server_fd);
        return 1;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
    {
        perror("bind");
        (void)close(server_fd);
        return 1;
    }
    if (listen(server_fd, 10) < 0)
    {
        perror("listen");
        (void)close(server_fd);
        return 1;
    }

    struct stat st_dir;
    memset(&st_dir, 0, sizeof(st_dir));
    if (stat("data", &st_dir) == -1)
    {
        if (mkdir("data", 0755) != 0 && errno != EEXIST)
        {
            perror("mkdir");
        }
    }

    (void)printf("Porphyrion %s listening on port %d (%d workers)\n",
                 PORPHYRION_VERSION, PORT, WORKER_COUNT);

    for (;;)
    {
        int client = accept(server_fd, (struct sockaddr *)&addr, &addrlen);
        if (client < 0)
        {
            if (errno == EINTR)
            {
                continue;
            }
            perror("accept");
            break;
        }
        if (queue_push(client) != 0)
        {
            reject_busy(client);
        }
    }

    //(void)printf("Shutting down.\n");
    curl_global_cleanup();
    (void)close(server_fd);
    for (int i = 0; i < WORKER_COUNT; i++)
    {
        worker_ctx_free(&g_workers[i]);
    }
    free(g_workers);
    return 0;
}
