import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface TailscalePeer {
  name: string;
  hostName?: string;
  ip: string;
  os: string;
  online: boolean;
  lastSeen?: string;
  isSelf?: boolean;
  tailscaleAddr?: string;
}

interface TailscaleJson {
  Self: TailscaleJsonNode;
  Peer: Record<string, TailscaleJsonNode>;
  MagicDNSSuffix?: string;
}

interface TailscaleJsonNode {
  HostName: string;
  DNSName?: string;
  OS: string;
  Online: boolean;
  TailscaleIPs?: string[];
  LastSeen?: string;
}

export async function tailscaleStatus(): Promise<TailscalePeer[]> {
  try {
    const { stdout } = await execFile("tailscale", ["status", "--json"], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const data: TailscaleJson = JSON.parse(stdout);
    const peers: TailscalePeer[] = [];
    const nodes: Array<readonly [string, TailscaleJsonNode]> = [
      ["self", data.Self] as const,
      ...Object.entries(data.Peer ?? {}),
    ];
    for (const [, node] of nodes) {
      if (!node) continue;
      const ip = node.TailscaleIPs?.[0] ?? "";
      if (!ip) continue;
      const dnsName = node.DNSName?.replace(/\.$/, "");
      const shortName = dnsName?.split(".")[0] ?? node.HostName;
      peers.push({
        name: shortName,
        hostName: node.HostName,
        ip,
        os: node.OS,
        online: !!node.Online,
        lastSeen: node.LastSeen,
        isSelf: node === data.Self,
        tailscaleAddr: dnsName ?? shortName,
      });
    }
    return peers;
  } catch (err) {
    console.error("tailscale status failed:", err);
    return [];
  }
}
