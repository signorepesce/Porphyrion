VERSION = v0.6
CC     ?= gcc

MAKEFLAGS += --warn-undefined-variables --no-builtin-rules

CFLAGS  = -std=c11 -Os -pthread -Iinclude -DPORPHYRION_VERSION=\"$(VERSION)\"
CFLAGS += -Wcast-align -Wcast-qual -Wconversion -Wdouble-promotion \
          -Wduplicated-branches -Wduplicated-cond -Werror -Wextra \
          -Wformat=2 -Wformat-security -Wformat-signedness \
          -Wjump-misses-init -Wlogical-op -Wall -Wmissing-prototypes \
          -Wnested-externs -Wnull-dereference -Wold-style-definition \
          -Wpedantic -Wpointer-arith -Wredundant-decls -Wshadow \
          -Wsign-conversion -Wstack-usage=8192 -Wstrict-overflow=2 \
          -Wstrict-prototypes -Wundef -Wwrite-strings
CFLAGS += -D_FORTIFY_SOURCE=2 -fstack-protector-all
CFLAGS += -fstack-clash-protection -fno-delete-null-pointer-checks
CFLAGS += -ftrivial-auto-var-init=zero
CFLAGS += -Wvla -Walloca -Wtrampolines
CFLAGS += -ffunction-sections -fdata-sections
CFLAGS += -fno-asynchronous-unwind-tables -fno-ident -pipe
CFLAGS += -MMD -MP

LDFLAGS = -lcurl -pthread -s -Wl,--gc-sections

TARGET     = sam-porter
SRC        = src/call_api.c \
             src/curl_util.c \
             src/decoder.c \
             src/dynbuf.c \
             src/http_parser.c \
             src/http_response.c \
             src/json.c \
             src/main.c \
             src/proxy_networking.c \
             src/router.c \
             src/stress.c

IMAGE_NAME = porphyrion
PORT       = 8099
OBJ_DIR   ?= obj
OBJ        = $(patsubst src/%.c, $(OBJ_DIR)/%.o, $(SRC))
DEP        = $(OBJ:.o=.d)

.PHONY: all clean analyze docker-build docker-clean docker-run
.DELETE_ON_ERROR:
.SUFFIXES:

all: $(TARGET)

ANALYZE = -std=c11 -pthread -Iinclude -DPORPHYRION_VERSION=\"$(VERSION)\" -Wall -Wextra -fanalyzer -Werror
analyze:
	@for f in $(SRC); do $(CC) $(ANALYZE) -c $$f -o /dev/null || exit 1; done
	@echo "  -fanalyzer: clean"

$(TARGET): $(OBJ)
	$(CC) -Wl,-z,noexecstack,-z,relro,-z,now $(OBJ) -o $(TARGET) $(LDFLAGS)

$(OBJ_DIR)/%.o: src/%.c Makefile | $(OBJ_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJ_DIR):
	mkdir -p $(OBJ_DIR)

clean:
	rm -f $(TARGET)
	rm -rf $(OBJ_DIR)

docker-run:
	podman build --target builder -t $(IMAGE_NAME)-builder .
	podman build -t $(IMAGE_NAME) .
	podman run --rm -it -p $(PORT):$(PORT) $(IMAGE_NAME)
	podman image prune -f

docker-build:
	podman build --target builder -t $(IMAGE_NAME)-builder .
	podman build -t $(IMAGE_NAME) .

docker-clean:
	podman rmi $(IMAGE_NAME) || true
	podman image prune -f

-include $(DEP)
