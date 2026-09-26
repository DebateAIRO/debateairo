// ARCH-FIX-PES-S01-p2 probe d3a — control: does `process.exitCode = 1` survive tsx with no database?
process.stdout.write("d3a set exitCode=1\n");
process.exitCode = 1;
