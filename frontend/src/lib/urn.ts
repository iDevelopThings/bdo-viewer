const PREFIX = "urn::";

export type URNParts = {
	domain: string;
	kind?: string;
	id: string;

	asNumber(): number | undefined;
};

export class URNHandler {
	public readonly domain: string;

	private kindSet: Set<string>;

	constructor(
		domain: string,
		kinds: string[] = []
	) {
		this.domain  = domain;
		this.kindSet = new Set(kinds);
	}

	public get hasKinds(): boolean {
		return this.kindSet.size > 0;
	}

	public new(...parts: Array<string | number>): string {
		if (this.hasKinds) {
			if (parts.length !== 2) {
				throw new Error(`${this.domain} URNs require kind and id`);
			}
			const [kind, id] = parts.map(String);
			if (!this.kindSet.has(kind)) {
				throw new Error(`${kind} is not a valid ${this.domain} URN kind`);
			}
			return `${PREFIX}${this.domain}:${kind}:${id}`;
		}

		if (parts.length !== 1) {
			throw new Error(`${this.domain} URNs require id`);
		}
		return `${PREFIX}${this.domain}:${String(parts[0])}`;
	}

	public parse(raw: string): URNParts {
		const parsed = parseURN(raw);
		if (parsed.domain !== this.domain) {
			throw new Error(`Expected ${this.domain} URN, got ${parsed.domain}`);
		}
		if (this.hasKinds && (!parsed.kind || !this.kindSet.has(parsed.kind))) {
			throw new Error(`${parsed.kind ?? ""} is not a valid ${this.domain} URN kind`);
		}
		if (!this.hasKinds && parsed.kind) {
			throw new Error(`${this.domain} URNs do not use a kind segment`);
		}
		return parsed;
	}

	public match(raw: string | undefined, kind?: string): boolean {
		if (!raw) {
			return false;
		}
		try {
			const parsed = parseURN(raw);
			if (parsed.domain !== this.domain) {
				return false;
			}
			if (kind !== undefined) {
				return parsed.kind === kind;
			}
			return this.hasKinds
				? !!parsed.kind && this.kindSet.has(parsed.kind)
				: !parsed.kind;
		} catch {
			return false;
		}
	}

	public tryUpdate(domain: string, kinds: string[]): void {
		if(domain !== this.domain) {
			throw new Error(`Cannot update URN handler domain from ${this.domain} to ${domain}`);
		}
		for(const kind of kinds) {
			this.kindSet.add(kind);
		}
	}

	public is(handler: URNHandler|undefined) : handler is URNHandler {
		if(!handler) {
			return false;
		}
		return handler.domain === this.domain;
	}
}

const urns: Record<string, URNHandler> = {};

export function parseURN(raw: string): URNParts {
	if (!raw.startsWith(PREFIX)) {
		throw new Error(`Invalid URN: ${raw}`);
	}

	const parts = raw.slice(PREFIX.length).split(":");
	if (parts.length === 2) {
		const [domain, id] = parts;
		if (!domain || !id) throw new Error(`Invalid URN: ${raw}`);
		return {
			domain,
			id,
			asNumber() {
				const num = Number(id);
				return isNaN(num) ? undefined : num;
			}
		};
	}
	if (parts.length === 3) {
		const [domain, kind, id] = parts;
		if (!domain || !kind || !id) throw new Error(`Invalid URN: ${raw}`);
		return {
			domain,
			kind,
			id,
			asNumber() {
				const num = Number(id);
				return isNaN(num) ? undefined : num;
			}
		};
	}

	throw new Error(`Invalid URN: ${raw}`);
}

// urnKind returns a urn's source discriminant: its domain, or "domain:kind" when
// the urn carries a kind segment — e.g. "item", "world:region", "knowledge:theme".
// This is the authoritative discriminant for an entry (finer-grained than the
// source's SourceKind, which can't tell knowledge themes from entries).
export function urnKind(raw: string | undefined): string | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = parseURN(raw);
		return parsed.kind ? `${parsed.domain}:${parsed.kind}` : parsed.domain;
	} catch {
		return undefined;
	}
}

export function createURNHandler(domain: string, kinds: string[] = []): URNHandler {
	if(domain in urns) {
		const existing = urns[domain];
		existing.tryUpdate(domain, kinds);

		return existing;
	}

	const handler = new URNHandler(domain, kinds);

	urns[domain] = handler;

	return handler;
}

export const ItemURN      = createURNHandler("item");
export const NpcURN       = createURNHandler("npc");
export const GrindSpotURN = createURNHandler("grindspot");
export const KnowledgeURN = createURNHandler("knowledge", ["theme", "entry"]);
export const WorldURN     = createURNHandler("world", ["region", "node", "territory"]);
export const RecipeURN    = createURNHandler("recipe", ["node"]);

export function tryMatchURN(raw: string | undefined): URNHandler | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		for (const k in urns) {
			const handler = urns[k];
			if (handler.match(raw)) {
				return handler;
			}
		}
	} catch {
		return undefined;
	}
}
