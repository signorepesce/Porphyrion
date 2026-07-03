#ifndef JSON_H
#define JSON_H

#include <stddef.h>

#define JSON_PATH_SEG 128

typedef enum
{
    JSON_UNDEF = 0,
    JSON_OBJ,
    JSON_ARR,
    JSON_STR,
    JSON_PRIM
} JsonType;

typedef struct
{
    JsonType type;
    int start;
    int end;
    int parent;
} JsonTok;

int json_parse(const char *js, size_t len, JsonTok *toks, int max);

void json_copy_str(const char *js, const JsonTok *t, char *out, size_t outsz);

int json_obj_get(const char *js, const JsonTok *toks, int ntok, int obj,
                 const char *key);

int json_path_get(const char *js, const JsonTok *toks, int ntok, int root,
                  const char *path);

long json_tok_long(const char *js, const JsonTok *t);

#endif
