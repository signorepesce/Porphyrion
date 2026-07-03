#ifndef CALL_API_H
#define CALL_API_H

#include "dynbuf.h"
#include <stddef.h>

#define CALL_RESP_MAX (32 * 1024 * 1024)
#define CALL_RHDR_SIZE (16 * 1024)
#define CALL_RESOLVED_SIZE 8192
#define CALL_ERR_SIZE 300
#define CALL_B64_SIZE (CALL_RHDR_SIZE * 2)
#define CALL_HDR_SIZE (CALL_RHDR_SIZE * 2 + 1024)

typedef struct
{
    DynBuf body;
    char rhdr[CALL_RHDR_SIZE];
    size_t rhdr_len;
    char resolved[CALL_RESOLVED_SIZE];
    char err_body[CALL_ERR_SIZE];
    char b64_hdrs[CALL_B64_SIZE];
    char hdr[CALL_HDR_SIZE];
} CallScratch;

int callscratch_init(CallScratch *cs);

void callscratch_reset(CallScratch *cs);

void callscratch_free(CallScratch *cs);

void perform_api_call(CallScratch *cs, int sock, const char *url,
                      const char *method, const char *post_body,
                      size_t post_body_len, const char *ct,
                      char *headers_payload);

#endif
