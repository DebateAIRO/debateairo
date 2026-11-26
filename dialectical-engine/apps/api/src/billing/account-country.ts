/**
 * The country an account chose at sign-up, or null when it chose none. It rejects when the country cannot be read.
 * The read must run inside the account's own request, on the request's database login.
 */
export interface AccountCountryPort { read(ownerRef: string): Promise<string | null>; }
