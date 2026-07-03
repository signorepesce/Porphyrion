#ifndef WORKER_H
#define WORKER_H

#include "call_api.h"
#include "dynbuf.h"

#define WORKER_REQ_MAX (8 * 1024 * 1024)
#define PROXY_URL_SIZE 8192
#define PROXY_METHOD_SIZE 16
#define PROXY_CT_SIZE 256
#define PROXY_HEADERS_SIZE 65536

typedef struct
{
    char url[PROXY_URL_SIZE];
    char method[PROXY_METHOD_SIZE];
    char ct[PROXY_CT_SIZE];
    char headers[PROXY_HEADERS_SIZE];
} ProxyMeta;

typedef struct
{
    DynBuf reqbuf;
    ProxyMeta meta;
    CallScratch call;
} WorkerCtx;

int worker_ctx_init(WorkerCtx *ctx);

void worker_ctx_reset(WorkerCtx *ctx);

void worker_ctx_free(WorkerCtx *ctx);

void handle_client(WorkerCtx *ctx, int sock);

#endif
