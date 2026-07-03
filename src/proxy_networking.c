#include "proxy_networking.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

static const char *g_host_alias = NULL;

void resolve_url_init(void)
{
    struct stat st;
    if (stat("/run/.containerenv", &st) == 0)
    {
        g_host_alias = "host.containers.internal";
    }
    else if (stat("/.dockerenv", &st) == 0)
    {
        g_host_alias = "host.docker.internal";
    }
    else
    {
        g_host_alias = NULL;
    }
}

void resolve_url(const char *src, char *dst, size_t size)
{
    assert(src != NULL);
    assert(dst != NULL);
    assert(size > 0);
    if (g_host_alias != NULL &&
        (strncmp(src, "http://localhost", 16) == 0 ||
         strncmp(src, "http://127.0.0.1", 16) == 0))
    {
        (void)snprintf(dst, size, "http://%s%s", g_host_alias, src + 16);
    }
    else
    {
        (void)snprintf(dst, size, "%s", src);
    }
}
