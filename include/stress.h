#ifndef STRESS_H
#define STRESS_H

#include "http_parser.h"

void stress_handle(int sock, const HttpRequest *req);

#endif
