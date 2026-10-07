"""Acquire the caller's retained open-file-description lock; no paths or secrets."""
import fcntl
import os
import stat
import sys

if sys.argv != [sys.argv[0], "3"]:
    sys.exit(74)
try:
    descriptor = 3
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
        sys.exit(74)
    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(73)
except (OSError, ValueError):
    sys.exit(74)
