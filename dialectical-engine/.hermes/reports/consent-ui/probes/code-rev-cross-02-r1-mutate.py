import sys, pathlib
which = sys.argv[1]
p = pathlib.Path(sys.argv[2])
s = p.read_text()
orig = s

HEAD_FN = """function topmostSurface(): StackEntry | undefined {
  for (let index = surfaceStack.length - 1; index >= 0; index -= 1) {
    const entry = surfaceStack[index]!;
    const container = entry.read().containerRef.current;
    if (container === null || container.isConnected) return entry;
  }
  return undefined;
}"""

if which == "FIFO":
    # rank by the FIRST registered entry instead of the last
    new = """function topmostSurface(): StackEntry | undefined {
  for (let index = 0; index < surfaceStack.length; index += 1) {
    const entry = surfaceStack[index]!;
    const container = entry.read().containerRef.current;
    if (container === null || container.isConnected) return entry;
  }
  return undefined;
}"""
    assert HEAD_FN in s, "HEAD function not found"
    s = s.replace(HEAD_FN, new)
elif which == "NOCONN":
    # the isConnected skip removed: the last registered entry always wins
    new = """function topmostSurface(): StackEntry | undefined {
  for (let index = surfaceStack.length - 1; index >= 0; index -= 1) {
    const entry = surfaceStack[index]!;
    return entry;
  }
  return undefined;
}"""
    assert HEAD_FN in s, "HEAD function not found"
    s = s.replace(HEAD_FN, new)
elif which == "NEIGHBOUR":
    # behaviourally identical: entries are unique objects, so indexOf === lastIndexOf
    assert "surfaceStack.lastIndexOf(entry)" in s
    s = s.replace("surfaceStack.lastIndexOf(entry)", "surfaceStack.indexOf(entry)")
else:
    raise SystemExit("unknown mutant " + which)

assert s != orig, "mutant changed nothing"
p.write_text(s)
print("applied", which)
