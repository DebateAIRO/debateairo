#define __STDC_WANT_LIB_EXT1__ 1
#include <sys/stat.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "fix09-profile-table.generated.h"

enum {
  ROOT_FD = 3, CONTROL_FD = 4, RESPONSE_FD = 5,
  KEY_CAP = 256, FRAME_CAP = 768, BIND_LEN = 194, OBS_LEN = 66
};

struct profile_row {
  uint8_t id;
  const char *name;
  enum fix09_identity_rule identity_rule;
  enum fix09_leaf_rule leaf_rule;
};
#define PROFILE_ROW(id, name, identity, leaf) { id, name, identity, leaf },
static const struct profile_row profile_rows[] = { FIX09_PROFILE_ROWS(PROFILE_ROW) };
#undef PROFILE_ROW

#define FIX09_NOINLINE __attribute__((noinline))
#define FIX09_CLEANUP_MARKER(name) __asm__ volatile( \
  ".globl _fix09_cleanup_" #name "\n_fix09_cleanup_" #name ":")

static FIX09_NOINLINE int fix09_wipe_secret_buffers(
    unsigned char key_read_buffer[KEY_CAP],
    unsigned char key_frame_buffer[FRAME_CAP]) {
  int first = memset_s(key_read_buffer, KEY_CAP, 0, KEY_CAP);
  int second = memset_s(key_frame_buffer, FRAME_CAP, 0, FRAME_CAP);
  return first == 0 && second == 0 ? 0 : -1;
}

static FIX09_NOINLINE int fix09_scan_secret_buffers_zero(
    const unsigned char key_read_buffer[KEY_CAP],
    const unsigned char key_frame_buffer[FRAME_CAP]) {
  unsigned char result = 0;
  size_t index;
  for (index = 0; index < KEY_CAP; index += 1) result |= key_read_buffer[index];
  for (index = 0; index < FRAME_CAP; index += 1) result |= key_frame_buffer[index];
  return result == 0 ? 0 : -1;
}

static uint32_t u32(const unsigned char *value) {
  return ((uint32_t)value[0] << 24) | ((uint32_t)value[1] << 16) |
    ((uint32_t)value[2] << 8) | (uint32_t)value[3];
}

static void put16(unsigned char *target, uint16_t value) {
  target[0] = (unsigned char)(value >> 8); target[1] = (unsigned char)value;
}

static void put32(unsigned char *target, uint32_t value) {
  target[0] = (unsigned char)(value >> 24); target[1] = (unsigned char)(value >> 16);
  target[2] = (unsigned char)(value >> 8); target[3] = (unsigned char)value;
}

static void put64(unsigned char *target, uint64_t value) {
  int index;
  for (index = 7; index >= 0; index -= 1) { target[index] = (unsigned char)value; value >>= 8; }
}

static FIX09_NOINLINE int read_all(int fd, unsigned char *target, size_t length) {
  size_t offset = 0;
  while (offset < length) {
    ssize_t count = read(fd, target + offset, length - offset);
    if (count <= 0) return -1;
    offset += (size_t)count;
  }
  return 0;
}

static FIX09_NOINLINE int write_all(int fd, const unsigned char *source, size_t length) {
  size_t offset = 0;
  while (offset < length) {
    ssize_t count = write(fd, source + offset, length - offset);
    if (count <= 0) return -1;
    offset += (size_t)count;
  }
  return 0;
}

static FIX09_NOINLINE int read_frame(unsigned char *frame, size_t *length) {
  uint32_t payload;
  if (read_all(CONTROL_FD, frame, 4) != 0) return -1;
  payload = u32(frame);
  if (payload < 14 || payload + 4 > FRAME_CAP) return -1;
  if (read_all(CONTROL_FD, frame + 4, payload) != 0) return -1;
  if (memcmp(frame + 4, "F10CUST7", 8) != 0 || frame[12] != 1) return -1;
  *length = (size_t)payload + 4;
  return 0;
}

static FIX09_NOINLINE int send_frame(unsigned char key_frame_buffer[FRAME_CAP],
    uint8_t opcode, uint32_t ordinal, const unsigned char *body, size_t length) {
  size_t payload = 14 + length;
  if (payload + 4 > FRAME_CAP) return -1;
  put32(key_frame_buffer, (uint32_t)payload);
  memcpy(key_frame_buffer + 4, "F10CUST7", 8);
  key_frame_buffer[12] = 1; key_frame_buffer[13] = opcode; put32(key_frame_buffer + 14, ordinal);
  memcpy(key_frame_buffer + 18, body, length);
  return write_all(RESPONSE_FD, key_frame_buffer, payload + 4);
}

static const struct profile_row *profile_named(const char *name) {
  size_t index;
  for (index = 0; index < FIX09_PROFILE_COUNT; index += 1)
    if (strcmp(name, profile_rows[index].name) == 0) return &profile_rows[index];
  return NULL;
}

static int safe_identity(const unsigned char *value, size_t length) {
  size_t index;
  if (length == 0 || length > 128 || !((value[0] >= 'a' && value[0] <= 'z') ||
      (value[0] >= '0' && value[0] <= '9'))) return -1;
  for (index = 0; index < length; index += 1) {
    unsigned char c = value[index];
    if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
        c == '.' || c == '_' || c == '-')) return -1;
  }
  return 0;
}

static int directory_ok(int fd, uid_t owner) {
  struct stat value;
  return fstat(fd, &value) == 0 && S_ISDIR(value.st_mode) && value.st_uid == owner &&
    (value.st_mode & 0022) == 0 ? 0 : -1;
}

static int same_stat(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev && left->st_ino == right->st_ino &&
    left->st_uid == right->st_uid && left->st_gid == right->st_gid &&
    left->st_mode == right->st_mode && left->st_nlink == right->st_nlink &&
    left->st_size == right->st_size &&
    left->st_mtimespec.tv_sec == right->st_mtimespec.tv_sec &&
    left->st_mtimespec.tv_nsec == right->st_mtimespec.tv_nsec &&
    left->st_ctimespec.tv_sec == right->st_ctimespec.tv_sec &&
    left->st_ctimespec.tv_nsec == right->st_ctimespec.tv_nsec;
}

static int leaf_ok(int fd, int parent, const char *name, const struct stat *initial) {
  struct stat descriptor;
  struct stat path;
  if (fstat(fd, &descriptor) != 0 || fstatat(parent, name, &path, AT_SYMLINK_NOFOLLOW) != 0) return -1;
  if (!S_ISREG(descriptor.st_mode) || !S_ISREG(path.st_mode) ||
      (descriptor.st_mode & 07777) != 0600 || descriptor.st_nlink != 1 ||
      descriptor.st_uid != geteuid() || descriptor.st_gid != getegid() ||
      descriptor.st_dev != path.st_dev || descriptor.st_ino != path.st_ino) return -1;
  return initial == NULL || same_stat(initial, &descriptor) ? 0 : -1;
}

static void encode_observed(unsigned char *target, const struct stat *value) {
  put64(target, (uint64_t)value->st_dev); put64(target + 8, (uint64_t)value->st_ino);
  put64(target + 16, (uint64_t)value->st_uid); put64(target + 24, (uint64_t)value->st_gid);
  put16(target + 32, (uint16_t)(value->st_mode & 07777));
  put64(target + 34, (uint64_t)value->st_nlink); put64(target + 42, (uint64_t)value->st_size);
  put64(target + 50, (uint64_t)value->st_mtimespec.tv_sec * UINT64_C(1000000000) +
    (uint64_t)value->st_mtimespec.tv_nsec);
  put64(target + 58, (uint64_t)value->st_ctimespec.tv_sec * UINT64_C(1000000000) +
    (uint64_t)value->st_ctimespec.tv_nsec);
}

static int ed25519_pkcs8(const unsigned char *value, size_t length) {
  static const unsigned char prefix[] = { 0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,
    0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20 };
  return length == 48 && memcmp(value, prefix, sizeof prefix) == 0 ? 0 : -1;
}

static int request_is(const unsigned char *frame, size_t length, uint8_t opcode,
    uint32_t ordinal, const unsigned char *binding, size_t extra) {
  return length == 18 + BIND_LEN + extra && frame[13] == opcode && u32(frame + 14) == ordinal &&
    memcmp(frame + 18, binding, BIND_LEN) == 0 ? 0 : -1;
}

int fix09_run_session(const struct profile_row *profile) {
  unsigned char key_read_buffer[KEY_CAP];
  unsigned char key_frame_buffer[FRAME_CAP];
  unsigned char binding[BIND_LEN];
  unsigned char response[BIND_LEN + 33 + OBS_LEN];
  unsigned char identities[3][129];
  size_t lengths[3];
  size_t frame_length;
  size_t private_frame_length;
  size_t offset;
  ssize_t private_write;
  ssize_t private_read;
  const unsigned char *identity = NULL;
  size_t identity_length = 0;
  struct stat root_state;
  struct stat initial;
  char leaf[134];
  int chain_fd = -1;
  int parent_fd = -1;
  int leaf_fd = -1;
  int secret_ready = 0;

  if (fstat(ROOT_FD, &root_state) != 0 || !S_ISDIR(root_state.st_mode) ||
      (root_state.st_mode & 0022) != 0) goto cleanup_early_error;
  if (read_frame(key_frame_buffer, &frame_length) != 0) goto cleanup_read_error;
  if (key_frame_buffer[13] != 0x01 || u32(key_frame_buffer + 14) != 0 ||
      frame_length < 18 + BIND_LEN + 3) goto cleanup_protocol_error;
  memcpy(binding, key_frame_buffer + 18, BIND_LEN);
  if (binding[64] != profile->id || binding[65] != profile->id) goto cleanup_protocol_error;
  offset = 18 + BIND_LEN;
  for (size_t index = 0; index < 3; index += 1) {
    lengths[index] = key_frame_buffer[offset++];
    if (offset + lengths[index] > frame_length ||
        safe_identity(key_frame_buffer + offset, lengths[index]) != 0) goto cleanup_protocol_error;
    memcpy(identities[index], key_frame_buffer + offset, lengths[index]);
    identities[index][lengths[index]] = 0; offset += lengths[index];
  }
  if (offset != frame_length) goto cleanup_protocol_error;
  if (profile->identity_rule == FIX09_IDENTITY_INVENTORY_API) { identity = identities[0]; identity_length = lengths[0]; }
  else if (profile->identity_rule == FIX09_IDENTITY_INVENTORY_RUNNER) { identity = identities[1]; identity_length = lengths[1]; }
  else if (profile->identity_rule == FIX09_IDENTITY_INVENTORY_SCHEDULER) { identity = identities[2]; identity_length = lengths[2]; }
  else if (profile->identity_rule == FIX09_IDENTITY_LITERAL_FIXAGENT_DAEMON) { identity = (const unsigned char *)"fixagent-daemon"; identity_length = 15; }
  else if (profile->identity_rule == FIX09_IDENTITY_LITERAL_OBSCTL) { identity = (const unsigned char *)"obsctl"; identity_length = 6; }

  if (profile->leaf_rule == FIX09_LEAF_KEYS_WATCHDOG_WITNESS) {
    parent_fd = openat(ROOT_FD, "keys", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    memcpy(leaf, "watchdog-witness.pk8", 21); leaf[21] = 0;
  } else {
    if (identity == NULL) goto cleanup_protocol_error;
    chain_fd = openat(ROOT_FD, "chain", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (chain_fd < 0 || directory_ok(chain_fd, root_state.st_uid) != 0) goto cleanup_early_error;
    parent_fd = openat(chain_fd, "private", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    memcpy(leaf, identity, identity_length); memcpy(leaf + identity_length, ".pk8", 5);
  }
  if (parent_fd < 0 || directory_ok(parent_fd, root_state.st_uid) != 0) goto cleanup_early_error;
  leaf_fd = openat(parent_fd, leaf, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC);
  if (leaf_fd < 0 || leaf_ok(leaf_fd, parent_fd, leaf, NULL) != 0 || fstat(leaf_fd, &initial) != 0 ||
      initial.st_size <= 0 || initial.st_size > KEY_CAP) goto cleanup_early_error;
  private_read = read(leaf_fd, key_read_buffer, (size_t)initial.st_size);
  if (private_read != initial.st_size) goto cleanup_read_error;
  if (ed25519_pkcs8(key_read_buffer, (size_t)initial.st_size) != 0 ||
      leaf_ok(leaf_fd, parent_fd, leaf, &initial) != 0) goto cleanup_protocol_error;

  private_frame_length = 14 + BIND_LEN + 2 + (size_t)initial.st_size + OBS_LEN;
  put32(key_frame_buffer, (uint32_t)private_frame_length);
  memcpy(key_frame_buffer + 4, "F10CUST7", 8);
  key_frame_buffer[12] = 1; key_frame_buffer[13] = 0x81; put32(key_frame_buffer + 14, 0);
  memcpy(key_frame_buffer + 18, binding, BIND_LEN);
  put16(key_frame_buffer + 18 + BIND_LEN, (uint16_t)initial.st_size);
  memcpy(key_frame_buffer + 20 + BIND_LEN, key_read_buffer, (size_t)initial.st_size);
  encode_observed(key_frame_buffer + 20 + BIND_LEN + (size_t)initial.st_size, &initial);
  private_write = write(RESPONSE_FD, key_frame_buffer, private_frame_length + 4);
  if (private_write != (ssize_t)(private_frame_length + 4)) goto cleanup_partial_write;
  secret_ready = 1;
  goto cleanup_success;

cleanup_read_error:
  FIX09_CLEANUP_MARKER(read_error);
  goto cleanup_common;
cleanup_protocol_error:
  FIX09_CLEANUP_MARKER(protocol_error);
  goto cleanup_common;
cleanup_partial_write:
  FIX09_CLEANUP_MARKER(partial_write);
  goto cleanup_common;
cleanup_early_error:
  FIX09_CLEANUP_MARKER(early_error);
  goto cleanup_common;
cleanup_success:
  FIX09_CLEANUP_MARKER(success);
cleanup_common:
  if (fix09_wipe_secret_buffers(key_read_buffer, key_frame_buffer) != 0 ||
      fix09_scan_secret_buffers_zero(key_read_buffer, key_frame_buffer) != 0) return 1;
  if (secret_ready == 0) return 1;

  memcpy(response, binding, BIND_LEN); response[BIND_LEN] = 2; response[BIND_LEN + 1] = 2; response[BIND_LEN + 2] = 3;
  if (send_frame(key_frame_buffer, 0x82, 1, response, BIND_LEN + 3) != 0) return 1;

  if (read_frame(key_frame_buffer, &frame_length) != 0) return 1;
  if (request_is(key_frame_buffer, frame_length, 0x05, 1, binding, 0) == 0) return 0;
  if (request_is(key_frame_buffer, frame_length, 0x02, 1, binding, 0) != 0 ||
      leaf_ok(leaf_fd, parent_fd, leaf, &initial) != 0) return 1;
  memcpy(response, binding, BIND_LEN); encode_observed(response + BIND_LEN, &initial);
  if (send_frame(key_frame_buffer, 0x83, 2, response, BIND_LEN + OBS_LEN) != 0) return 1;

  if (read_frame(key_frame_buffer, &frame_length) != 0) return 1;
  if (request_is(key_frame_buffer, frame_length, 0x05, 2, binding, 0) == 0) return 0;
  if (request_is(key_frame_buffer, frame_length, 0x03, 2, binding, 32) != 0 ||
      leaf_ok(leaf_fd, parent_fd, leaf, &initial) != 0) return 1;
  memcpy(response, key_frame_buffer + 18, BIND_LEN + 32);
  encode_observed(response + BIND_LEN + 32, &initial);
  if (send_frame(key_frame_buffer, 0x84, 3, response, BIND_LEN + 32 + OBS_LEN) != 0) return 1;

  if (read_frame(key_frame_buffer, &frame_length) != 0) return 1;
  if (request_is(key_frame_buffer, frame_length, 0x05, 3, binding, 0) == 0) return 0;
  if (request_is(key_frame_buffer, frame_length, 0x04, 3, binding, 33) != 0 ||
      leaf_ok(leaf_fd, parent_fd, leaf, &initial) != 0) return 1;
  memcpy(response, key_frame_buffer + 18, BIND_LEN + 33);
  encode_observed(response + BIND_LEN + 33, &initial);
  if (send_frame(key_frame_buffer, 0x85, 4, response, BIND_LEN + 33 + OBS_LEN) != 0) return 1;
  if (read_frame(key_frame_buffer, &frame_length) != 0 ||
      request_is(key_frame_buffer, frame_length, 0x06, 4, binding, 33) != 0) return 1;

  if (close(leaf_fd) != 0) return 1; leaf_fd = -1;
  if (close(parent_fd) != 0) return 1; parent_fd = -1;
  if (close(CONTROL_FD) != 0) return 1;
  memcpy(response, binding, BIND_LEN); response[BIND_LEN] = 7; response[BIND_LEN + 1] = 1;
  if (send_frame(key_frame_buffer, 0x86, 5, response, BIND_LEN + 2) != 0 ||
      close(RESPONSE_FD) != 0) return 1;
  if (leaf_fd >= 0) (void)close(leaf_fd);
  if (parent_fd >= 0) (void)close(parent_fd);
  if (chain_fd >= 0) (void)close(chain_fd);
  return 0;
}

int main(int argc, char **argv) {
  const struct profile_row *profile;
  if (argc != 2) return 64;
  profile = profile_named(argv[1]);
  if (profile == NULL) return 64;
  return fix09_run_session(profile);
}
