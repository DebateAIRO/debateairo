import sys, io
path, old, new, want = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
t = io.open(path, encoding="utf-8").read()
n = t.count(old)
if n != want:
    sys.stderr.write("ANCHOR COUNT %d (wanted %d) for %r\n" % (n, want, old[:70])); sys.exit(3)
io.open(path, "w", encoding="utf-8").write(t.replace(old, new))
