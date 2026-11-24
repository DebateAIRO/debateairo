import { describe, expect, it } from "vitest";
import { socialCredentialCustody } from "../../deploy/social/social-relay.mjs";

/**
 * systemd (259 on the server) hands a LoadCredential= file to a unit as root's: the folder root:root 0550 and the
 * file root:root 0440, each with one named-user ACL entry for the unit's own user. The Turnstile relay already
 * accepts exactly that shape next to "the unit's user owns both, nobody else may read". The social relay accepted
 * only the second, so it would have refused to start under systemd. The social relay now decides by the same two shapes.
 */
const UID = 978;
const dir = (uid: number, gid: number, mode: number) => ({ uid, gid, mode: 0o040000 | mode, isDirectory: () => true, isSymbolicLink: () => false });
const file = (uid: number, gid: number, mode: number, size = 300, nlink = 1) => ({ uid, gid, mode: 0o100000 | mode, size, nlink, isFile: () => true });
const acl = (uid: number, permissions: number) => ({ version: 2, entries: [
  { tag: 1, permissions, id: 4294967295 }, { tag: 2, permissions, id: uid }, { tag: 4, permissions: 0, id: 4294967295 },
  { tag: 16, permissions, id: 4294967295 }, { tag: 32, permissions: 0, id: 4294967295 }] });
const systemdAcl = (uid = UID) => ({ parent: acl(uid, 5), file: acl(uid, 4) });
const REFUSED = "SOCIAL_CUSTODY_INVALID";

describe("the social relay's credential file custody", () => {
  it("accepts a folder and file the relay's own user owns, closed to everyone else", () => {
    expect(socialCredentialCustody(dir(UID, UID, 0o700), file(UID, UID, 0o600), UID)).toBe("owned");
    expect(socialCredentialCustody(dir(UID, UID, 0o500), file(UID, UID, 0o400), UID)).toBe("owned");
  });

  it("accepts systemd's shape: root's 0550 folder and 0440 file with the relay user's exact ACL", () => {
    expect(socialCredentialCustody(dir(0, 0, 0o550), file(0, 0, 0o440), UID, systemdAcl())).toBe("systemd");
  });

  it.each([
    ["no ACL was read", dir(0, 0, 0o550), file(0, 0, 0o440), null],
    ["the ACL names another user", dir(0, 0, 0o550), file(0, 0, 0o440), systemdAcl(UID + 1)],
    ["the file's ACL lets the user write", dir(0, 0, 0o550), file(0, 0, 0o440), { parent: acl(UID, 5), file: acl(UID, 6) }],
    ["the ACL has an extra entry", dir(0, 0, 0o550), file(0, 0, 0o440), { parent: acl(UID, 5), file: { version: 2, entries: [...acl(UID, 4).entries, { tag: 2, permissions: 4, id: 1000 }] } }],
    ["the folder is open to others", dir(0, 0, 0o555), file(0, 0, 0o440), systemdAcl()],
    ["the file is open to others", dir(0, 0, 0o550), file(0, 0, 0o444), systemdAcl()],
    ["the folder is another group's", dir(0, 50, 0o550), file(0, 0, 0o440), systemdAcl()],
    ["the file is another user's", dir(0, 0, 0o550), file(1000, 0, 0o440), systemdAcl()]
  ])("refuses systemd's shape when %s", (_name, parent, metadata, given) => {
    expect(() => socialCredentialCustody(parent, metadata, UID, given)).toThrow(REFUSED);
  });

  it.each([
    ["a file its group may read", dir(UID, UID, 0o700), file(UID, UID, 0o640)],
    ["a folder its group may enter", dir(UID, UID, 0o750), file(UID, UID, 0o600)],
    ["another user's file", dir(UID, UID, 0o700), file(UID + 1, UID, 0o600)],
    ["an empty file", dir(UID, UID, 0o700), file(UID, UID, 0o600, 1)],
    ["a file over 32 KiB", dir(UID, UID, 0o700), file(UID, UID, 0o600, 32769)],
    ["a file with a second name", dir(UID, UID, 0o700), file(UID, UID, 0o600, 300, 2)]
  ])("refuses %s", (_name, parent, metadata) => {
    expect(() => socialCredentialCustody(parent, metadata, UID)).toThrow(REFUSED);
  });

  it("never accepts root's own files for a relay that runs as root", () => {
    expect(() => socialCredentialCustody(dir(0, 0, 0o550), file(0, 0, 0o440), 0, systemdAcl(0))).toThrow(REFUSED);
  });
});
