/* Network Maps: interactive topology viewer. Every IP, port, hostname and result below comes from my own lab notes. */
(function () {
  'use strict';
  var root = document.getElementById('topo');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg', W = 176, H = 60;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 24x24 line icons, one per device type
  var ICON = {
    firewall: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.3h18M3 14.7h18M9 4v5.3M15 4v5.3M12 9.3v5.4M7 14.7V20M17 14.7V20"/>',
    router: '<circle cx="12" cy="12" r="9"/><path d="M7.5 9.5h9l-2.5-2.5M16.5 14.5h-9l2.5 2.5"/>',
    'switch': '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 12h1M9.5 12h1M13 12h1M16.5 12h1"/>',
    vswitch: '<rect x="2" y="7" width="20" height="10" rx="2" stroke-dasharray="3 2.5"/><path d="M6 12h1M9.5 12h1M13 12h1M16.5 12h1"/>',
    server: '<rect x="4" y="3" width="16" height="7.5" rx="1.5"/><rect x="4" y="13.5" width="16" height="7.5" rx="1.5"/><path d="M8 6.75h.01M8 17.25h.01M12 6.75h4M12 17.25h4"/>',
    workstation: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    linux: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15H17"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
    lb: '<circle cx="5" cy="12" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M7.2 12h9.6M7 11l10-5.2M7 13l10 5.2"/>',
    cloud: '<path d="M7 19h10.5a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.6 9.6 4.8 4.8 0 0 0 7 19z"/>',
    ap: '<path d="M4.5 8.5a10.5 10.5 0 0 1 15 0M7.5 11.5a6.2 6.2 0 0 1 9 0"/><circle cx="12" cy="14.5" r="1"/><rect x="5" y="18" width="14" height="3" rx="1"/>',
    storage: '<rect x="3" y="3.5" width="18" height="5" rx="1.2"/><rect x="3" y="9.5" width="18" height="5" rx="1.2"/><rect x="3" y="15.5" width="18" height="5" rx="1.2"/><path d="M6.5 6h.01M6.5 12h.01M6.5 18h.01"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.6A5 5 0 0 1 21 19.5"/>'
  };
  var TYPE = { firewall: 'Firewall', router: 'Router', 'switch': 'Switch', vswitch: 'Virtual switch', server: 'Server', workstation: 'Workstation', linux: 'Linux', database: 'Database', mail: 'Mail server', lb: 'Load balancer', cloud: 'Cloud', ap: 'Wireless AP', storage: 'Storage', users: 'Users' };
  var STATUS = { ok: 'Running', wip: 'In progress', design: 'Design', ext: 'External' };
  var LAN = ['Private LAN · 192.168.1.x'];

  /* Map data. Nodes: x/y = card centre. Links: pa/pb offset the ends inside a card, via = waypoints,
     my = y of the elbow, lp = fixed label position, side -1 = label left of a vertical line. */
  var MAPS = [{
    id: 'msp', name: 'Enterprise MSP Lab', status: 'wip', badge: 'In progress', note: 'Phases 1–2 complete · Phase 3 in progress',
    summary: "A production-style MSP network built on Hyper-V in Holland College's isolated datacenter lab, with SIEM monitoring, now being extended to Oracle Cloud with hybrid identity.",
    w: 1150, h: 630,
    zones: [
      { x: 40, y: 240, w: 785, h: 360, name: 'Private LAN', meta: 'Hyper-V on Windows Server 2022 Datacenter · 192.168.1.x' },
      { x: 880, y: 100, w: 240, h: 500, name: 'Cloud', meta: 'Phase 3 (in progress)' }
    ],
    nodes: [
      { id: 'wan', t: 'cloud', x: 432, y: 60, host: 'Internet / WAN', role: 'Upstream connection', svc: ['Upstream connection'], why: 'Only traffic allowed by pfSense gets in.' },
      { id: 'pfs', t: 'firewall', x: 432, y: 175, host: 'pfSense', role: 'Stateful firewall', st: 'ok', ifs: ['WAN', 'LAN (gateway for the private LAN)'], svc: ['Stateful firewall', 'Strict routing rules', 'NAT for outbound traffic'], why: 'Segments the WAN from the private LAN, so only traffic its rules allow reaches the lab.' },
      { id: 'vsw', t: 'vswitch', x: 432, y: 320, host: 'Hyper-V vSwitch', role: 'Virtual switch', st: 'ok', svc: ['Host: Windows Server 2022 Datacenter'], why: 'Connects all lab VMs on the private LAN.' },
      { id: 'dc', t: 'server', x: 140, y: 490, host: 'Domain Controller', role: 'Primary DC', st: 'ok', ips: LAN, svc: ['Windows Server 2022', 'Active Directory Domain Services', 'DNS for the domain', 'Group Policy security baseline', 'Wazuh agent'], why: 'Accounts, DNS and the Group Policy security baseline all come from one primary DC.' },
      { id: 'w10', t: 'workstation', x: 335, y: 490, host: 'Windows 10', role: 'Domain-joined client', st: 'ok', ips: LAN, svc: ['Domain-joined', 'GPO-hardened', 'Wazuh agent'], why: 'Hardened by Group Policy and watched by its Wazuh agent.' },
      { id: 'ubu', t: 'linux', x: 530, y: 490, host: 'Ubuntu', role: 'Linux endpoint', st: 'ok', ips: LAN, svc: ['Linux endpoint joined to the domain'] },
      { id: 'wz', t: 'server', x: 725, y: 490, host: 'Wazuh Manager', role: 'SIEM · Linux', st: 'ok', ips: LAN, svc: ['Wazuh on Linux', 'Ingests alerts.log / alerts.json', 'File Integrity Monitoring', 'CVE vulnerability detection', 'Detected simulated Nmap scans and unauthorized directory traversal'], why: 'One place to see security events from the agents on the DC and Windows 10.' },
      { id: 'entra', t: 'cloud', x: 1000, y: 490, host: 'Microsoft Entra ID', role: 'Hybrid identity', st: 'wip', planned: 1, svc: ['Hybrid identity', 'On-prem AD synced by Entra Connect'], why: 'Phase 3: the same accounts on-prem and in the cloud.' },
      { id: 'oci', t: 'cloud', x: 1000, y: 175, host: 'Oracle Cloud VCN', role: 'Phase 3', st: 'wip', planned: 1, svc: ['VCN subnets', 'Site-to-site IPsec VPN to the lab', 'Network load balancer'], why: 'Phase 3: extends the lab to Oracle Cloud over a site-to-site IPsec VPN.' }
    ],
    links: [
      { a: 'wan', b: 'pfs', label: 'WAN' },
      { a: 'pfs', b: 'vsw', label: 'LAN', lp: [440, 226] },
      { a: 'vsw', b: 'dc', my: 410 }, { a: 'vsw', b: 'w10', my: 410 }, { a: 'vsw', b: 'ubu', my: 410 }, { a: 'vsw', b: 'wz', my: 410 },
      { a: 'dc', b: 'entra', dash: 1, label: 'Entra Connect sync', via: [[140, 575], [1000, 575]] },
      { a: 'pfs', b: 'oci', dash: 1, label: 'IPsec site-to-site VPN', proto: 'IPsec' }
    ],
    flows: [
      { name: 'Domain sign-in', insp: { proto: 'Kerberos / LDAP', src: 'Windows 10', dst: 'Domain Controller' }, steps: [
        { n: 'w10', t: 'Windows 10 sends a sign-in request to the domain' },
        { n: 'vsw', t: 'The vSwitch carries it across the LAN' },
        { n: 'dc', t: 'The DC verifies the account and applies Group Policy' }] },
      { name: 'Threat detected', steps: [
        { n: 'w10', t: 'A simulated Nmap scan from 192.168.1.x hits Windows 10' },
        { n: 'vsw', t: 'Its Wazuh agent forwards the event', insp: { src: 'Wazuh agent', dst: 'Wazuh manager' } },
        { n: 'wz', t: 'Wazuh fires rule 100002 "Nmap scan detected"', insp: { src: 'Wazuh agent', dst: 'Wazuh manager' } }] },
      { name: 'File tampering detected', steps: [
        { n: 'dc', t: 'A monitored file changes' },
        { n: 'vsw', t: 'File Integrity Monitoring reports it' },
        { n: 'wz', t: 'Wazuh raises an integrity alert' }] },
      { name: 'Internet access', steps: [
        { n: 'w10', t: 'Windows 10 opens a website' },
        { n: 'vsw', t: 'Forwarded to its gateway' },
        { n: 'pfs', t: 'pfSense applies firewall rules and NAT', insp: { nat: 'Source NAT: 192.168.1.x → WAN address' } },
        { n: 'wan', t: 'Traffic leaves to the internet' }] },
      { name: 'Hybrid identity (Phase 3)', steps: [
        { n: 'dc', t: 'An account changes in on-prem AD' },
        { n: 'entra', t: 'Entra Connect syncs it to Entra ID' }] }
    ]
  }, {
    id: 'cloud', name: 'Cloud Web & Email Lab', status: 'wip', badge: 'In progress', note: 'Oracle Cloud Always Free',
    summary: 'My own website and email server on Oracle Cloud: a VCN with public and private subnets, a Linux NAT router/firewall, a web stack and a mail server, built with Terraform.',
    w: 1200, h: 770,
    zones: [
      { x: 30, y: 130, w: 1140, h: 625, name: 'VCN cnet-core', meta: '172.16.0.0/16' },
      { x: 420, y: 185, w: 720, h: 150, name: 'sn-edge', meta: '172.16.1.0/24 · public' },
      { x: 60, y: 395, w: 320, h: 150, name: 'sn-servers', meta: '172.16.50.0/24 · private' },
      { x: 60, y: 600, w: 320, h: 140, name: 'sn-data', meta: '172.16.60.0/24 · private' }
    ],
    pills: [{ x: 750, y: 130, text: 'Internet gateway' }],
    nodes: [
      { id: 'vis', t: 'users', x: 180, y: 60, host: 'Visitors', role: 'via Cloudflare', svc: ['Reach the site through Cloudflare', 'DNS with DNSSEC', 'HTTPS proxy'] },
      { id: 'omx', t: 'cloud', x: 560, y: 60, host: 'Other mail servers', role: 'Deliver via MX', svc: ['Deliver mail using the MX record'] },
      { id: 'adm', t: 'workstation', x: 940, y: 60, host: 'Admin', role: 'Me · SSH / SFTP', svc: ['SSH and SFTP'] },
      { id: 'lb', t: 'lb', x: 180, y: 255, host: 'lb-web', role: 'Load balancer', st: 'wip', svc: ['Oracle flexible, 10 Mbps', 'Listens on 80 / 443', 'Health check /healthz → web01:80'], why: 'Visitors reach web01 only through the load balancer; web01 has no public IP.' },
      { id: 'mail', t: 'mail', x: 560, y: 265, host: 'mail01', role: 'Mail server', st: 'wip', ip: '172.16.1.25', ips: ['172.16.1.25 (sn-edge)', 'Public IP'], svc: ['Postfix · SMTP 25, submission 587', 'Dovecot · IMAPS 993', 'Rspamd anti-spam'], why: 'Outgoing mail relays through OCI Email Delivery on 587 because Oracle blocks outbound port 25.' },
      { id: 'gw', t: 'router', x: 940, y: 265, host: 'gw01', role: 'NAT router / firewall', st: 'wip', ip: '172.16.1.10', ips: ['172.16.1.10 (sn-edge)', 'Public IP'], svc: ['Linux iptables NAT (MASQUERADE) for the private subnets', 'SSH jump host', 'Port-forward 2222 → web01:22 (DNAT)', 'fail2ban'], why: 'The private servers have no public IP, so gw01 gives them outbound NAT and is the SSH jump host.' },
      { id: 'web', t: 'server', x: 180, y: 470, host: 'web01', role: 'Web server', st: 'wip', ip: '172.16.50.10', ips: ['172.16.50.10 (sn-servers)', 'No public IP'], svc: ['nginx', 'PHP-FPM', 'Roundcube webmail in Docker'], why: 'No public IP: visitors come in through lb-web and admin access goes through gw01.' },
      { id: 'app', t: 'database', x: 180, y: 675, host: 'app01', role: 'Database', st: 'wip', ip: '172.16.60.10', ips: ['172.16.60.10 (sn-data)', 'No public IP'], svc: ['MariaDB 3306 · databases site and roundcube', 'Nightly backups'], why: 'The data sits in its own private subnet with no public IP.' }
    ],
    links: [
      { a: 'vis', b: 'lb', label: 'HTTPS 443', proto: 'HTTPS', lp: [188, 112] },
      { a: 'omx', b: 'mail', label: 'SMTP 25', proto: 'SMTP', lp: [568, 112] },
      { a: 'adm', b: 'gw', label: 'SSH 22 · SFTP 2222', proto: 'SSH / SFTP', lp: [948, 112] },
      { a: 'lb', b: 'web', label: 'HTTP 80', proto: 'HTTP' },
      { a: 'web', b: 'app', label: 'MariaDB 3306' },
      { a: 'web', b: 'mail', label: 'IMAPS 993 · SMTP 587', pa: [0, -10], via: [[560, 460]] },
      { a: 'gw', b: 'web', label: 'default route 0.0.0.0/0 · NAT', via: [[940, 525], [240, 525]], pb: [60, 10] },
      { a: 'gw', b: 'app', label: 'default route 0.0.0.0/0 · NAT', via: [[940, 675]] }
    ],
    flows: [
      { name: 'Page view', steps: [
        { n: 'vis', t: 'Browser requests adwaithjayaraj.com through Cloudflare' },
        { n: 'lb', t: 'The load balancer forwards HTTP', insp: { proto: 'HTTP', src: 'lb-web', dst: '172.16.50.10:80' } },
        { n: 'web', t: 'nginx hands the page to PHP' },
        { n: 'app', t: 'PHP queries MariaDB', insp: { proto: 'MariaDB', src: '172.16.50.10', dst: '172.16.60.10:3306' } }] },
      { name: 'Email arrives', steps: [
        { n: 'omx', t: 'The sender looks up the MX record for adwaithjayaraj.com' },
        { n: 'mail', t: 'Postfix accepts on port 25', insp: { proto: 'SMTP', src: 'Other mail server', dst: '172.16.1.25:25' } },
        { n: 'mail', t: 'Rspamd scores it' },
        { n: 'mail', t: 'Dovecot stores it in the mailbox' }] },
      { name: 'Read webmail', steps: [
        { n: 'vis', t: 'Open webmail.adwaithjayaraj.com' },
        { n: 'lb', t: 'The load balancer forwards it' },
        { n: 'web', t: 'Roundcube on web01 handles it' },
        { n: 'mail', t: 'IMAPS fetches the inbox from mail01', insp: { proto: 'IMAPS', src: '172.16.50.10', dst: '172.16.1.25:993' } }] },
      { name: 'SFTP upload', steps: [
        { n: 'adm', t: 'FileZilla connects to gw01 port 2222' },
        { n: 'gw', t: 'gw01 rewrites the destination (DNAT) to 172.16.50.10:22', insp: { proto: 'SFTP', nat: 'DNAT gw01:2222 → 172.16.50.10:22' } },
        { n: 'web', t: 'Files land in /var/www/site' }] },
      { name: 'Update via NAT', steps: [
        { n: 'app', t: 'app01 has no public IP, so it sends to its gateway' },
        { n: 'gw', t: 'gw01 masquerades the source as 172.16.1.10 and sends it out', insp: { nat: 'SNAT 172.16.60.10 → 172.16.1.10' } }] }
    ]
  }, {
    id: 'cnet', name: 'CNET Lab Redesign', status: 'design', badge: 'Design', note: 'Holland College coursework design',
    summary: 'My proposed redesign of the second-year lab: firewall-routed VLANs, a Hyper-V failover cluster on shared iSCSI storage, an ESXi host for the web course, and one isolated network per student.',
    w: 1630, h: 794,
    zones: [
      { x: 20, y: 324, w: 190, h: 160, name: 'Wi-Fi', meta: 'VLAN 98 · 172.16.98.0/24' },
      { x: 230, y: 324, w: 190, h: 300, name: 'Servers', meta: 'VLAN 50 · 172.16.50.0/24' },
      { x: 440, y: 324, w: 620, h: 200, name: 'Management', meta: 'VLAN 9 · 172.16.9.0/24' },
      { x: 440, y: 574, w: 620, h: 200, name: 'Storage', meta: 'VLAN 60 · 172.16.60.0/24 · not routed' },
      { x: 1100, y: 324, w: 200, h: 160, name: 'Lab PCs', meta: 'VLAN 99 · 172.16.99.0/24' },
      { x: 1320, y: 324, w: 290, h: 160, name: 'Students', meta: 'VLANs 201–224 · 172.16.(200+N).0/24' }
    ],
    nodes: [
      { id: 'fgt', t: 'firewall', x: 800, y: 50, host: 'FortiGate-501E', role: 'Routes every VLAN', st: 'design', ifs: ['One sub-interface per VLAN, gateway .1 on each', 'LACP uplink on Gi1/0/23 and Gi2/0/48 (802.1Q trunk, native VLAN 999)'], svc: ['Routes and filters every VLAN', 'Zones: Management, Servers, Lab PCs, Wi-Fi, Students', 'Traffic between student VLANs denied'], why: 'Every VLAN is routed through the firewall, so all traffic between networks is filtered.' },
      { id: 'sw', t: 'switch', x: 800, y: 200, host: 'Cisco 3750-X stack', role: 'Layer 2 core', st: 'design', svc: ['Trunks restricted to needed VLANs', 'Unused ports parked in VLAN 999', 'Port security, BPDU guard, DHCP snooping', 'SSH only'], why: 'Layer 2 only: routing stays on the FortiGate, and unused ports sit in VLAN 999.' },
      { id: 'ap', t: 'ap', x: 115, y: 414, host: 'FortiAP FAP221E', role: 'Wireless AP', st: 'design', ifs: ['Gi1/0/22 trunk (VLANs 9, 98)'], svc: ['WPA3-Enterprise SSID on VLAN 98'] },
      { id: 'dc1', t: 'server', x: 325, y: 414, host: 'DC1', role: 'AD DS · DNS · DHCP', st: 'design', ip: '172.16.50.200', ips: ['172.16.50.200'], ifs: ['Teamed on Gi1/0/1 and Gi2/0/47'], svc: ['AD DS', 'DNS', 'DHCP (failover with DC2)', 'NPS'] },
      { id: 'dc2', t: 'server', x: 325, y: 549, host: 'DC2', role: 'DC · VM on ESX1', st: 'design', ip: '172.16.50.202', ips: ['172.16.50.202'], svc: ['Second domain controller', 'Runs as a VM on ESX1'], why: 'DHCP failover partner for DC1.' },
      { id: 'h1', t: 'server', x: 545, y: 414, host: 'PSWSCL1', role: 'Hyper-V cluster node', st: 'design', ip: '172.16.9.11', ips: ['172.16.9.11 (management)', '172.16.60.21 (iSCSI)'], ifs: ['SET team Gi1/0/3 + Gi2/0/43 (trunk 9, 50, 201–224)', 'iSCSI on Te1/1/1'], svc: ['Hyper-V failover cluster node'], why: 'Two cluster nodes on shared iSCSI storage.' },
      { id: 'h2', t: 'server', x: 745, y: 414, host: 'PSWSCL2', role: 'Hyper-V cluster node', st: 'design', ip: '172.16.9.12', ips: ['172.16.9.12 (management)', '172.16.60.22 (iSCSI)'], ifs: ['SET team Gi1/0/5 + Gi2/0/44', 'iSCSI on Te2/1/1'], svc: ['Hyper-V failover cluster node'], why: 'Two cluster nodes on shared iSCSI storage.' },
      { id: 'esx', t: 'server', x: 960, y: 414, host: 'ESX1', role: 'VMware ESXi', st: 'design', ip: '172.16.9.13', ips: ['172.16.9.13', 'vCenter: 172.16.9.14'], ifs: ['Gi1/0/7 + Gi2/0/39 trunk'], svc: ['Hosts the web-course Linux VMs', 'Hosts DC2'] },
      { id: 'nas', t: 'storage', x: 645, y: 714, host: 'TrueNAS', role: 'iSCSI target', st: 'design', ip: '172.16.60.10', ips: ['172.16.60.10 (storage)', '172.16.9.15 (management)'], ifs: ['2× 10 GbE LACP on Te1/1/2 + Te2/1/2'], svc: ['iSCSI target with CHAP for the cluster', 'Mirror pool'], why: 'Shared storage for the cluster on a VLAN that is not routed.' },
      { id: 'pcs', t: 'workstation', x: 1200, y: 414, host: 'Lab PCs', role: '24 × Windows 11', st: 'design', svc: ['24 Windows 11 PCs', 'DHCP reservations .10+N'] },
      { id: 'stu', t: 'users', x: 1465, y: 414, host: 'Student VLANs', role: 'One per student', st: 'design', svc: ['One isolated network per student', 'Student domain sN.lab.local', "DHCP/DNS from the student's own DC VM"], why: 'Each student gets an isolated network; the FortiGate denies traffic between student VLANs.' }
    ],
    links: [
      { a: 'fgt', b: 'sw', thick: 1, label: '802.1Q trunk · LACP', side: -1, ifB: 'Gi1/0/23 · Gi2/0/48', vlan: 'native VLAN 999', vp: 0.3, proto: '802.1Q · LACP' },
      { a: 'sw', b: 'ap', pa: [-80, 0], my: 244, ifA: 'Gi1/0/22', vlan: 'VLAN 9, 98', proto: '802.1Q trunk' },
      { a: 'sw', b: 'dc1', pa: [-56, 0], my: 266, ifA: 'Gi1/0/1 · Gi2/0/47', proto: 'NIC team' },
      { a: 'sw', b: 'h1', pa: [-32, 0], my: 288, ifA: 'Gi1/0/3 · Gi2/0/43', vlan: 'VLAN 9, 50, 201–224', proto: 'SET team · trunk' },
      { a: 'sw', b: 'h2', pa: [-8, 0], my: 310, ifA: 'Gi1/0/5 · Gi2/0/44', proto: 'SET team' },
      { a: 'sw', b: 'esx', pa: [10, 0], my: 310, ifA: 'Gi1/0/7 · Gi2/0/39', proto: 'trunk' },
      { a: 'sw', b: 'nas', pa: [34, 0], via: [[834, 288], [1080, 288], [1080, 714]], tip: 'TrueNAS management · 172.16.9.15' },
      { a: 'sw', b: 'pcs', pa: [58, 0], my: 266 },
      { a: 'sw', b: 'stu', pa: [82, 0], my: 244 },
      { a: 'h1', b: 'nas', thick: 1, dash: 1, pa: [-44, 0], via: [[501, 644], [645, 644]], label: 'iSCSI · VLAN 60 · 10 GbE · MTU 9000', lp: [800, 636], ifA: 'Te1/1/1', ifB: 'Te1/1/2 · Te2/1/2', speed: '10 GbE', proto: 'iSCSI' },
      { a: 'h2', b: 'nas', thick: 1, dash: 1, pa: [44, 0], via: [[789, 644], [645, 644]], tip: 'iSCSI · VLAN 60 · 10 GbE · MTU 9000', ifA: 'Te2/1/1', speed: '10 GbE', proto: 'iSCSI' },
      { a: 'h1', b: 'h2', thick: 1, pa: [40, 0], pb: [-40, 0], via: [[585, 472], [705, 472]], label: 'cluster / live migration\nVLAN 61 · 10 GbE DAC', lp: [645, 492], la: 'middle', speed: '10 GbE DAC' }
    ],
    flows: []
  }];

  // data check: warns in the console when a map refers to a device that is not there, or a flow jumps between unlinked devices
  MAPS.forEach(function (m) {
    var ids = {};
    m.nodes.forEach(function (n) { ids[n.id] = 1; });
    var linked = function (a, b) { return m.links.some(function (l) { return (l.a === a && l.b === b) || (l.a === b && l.b === a); }); };
    m.links.forEach(function (l) { [l.a, l.b].forEach(function (id) { if (!ids[id]) console.warn('[maps] ' + m.id + ': link uses unknown device "' + id + '"'); }); });
    m.flows.forEach(function (f) {
      f.steps.forEach(function (st, i) {
        if (!ids[st.n]) console.warn('[maps] ' + m.id + ' / ' + f.name + ': step ' + (i + 1) + ' uses unknown device "' + st.n + '"');
        else if (i && f.steps[i - 1].n !== st.n && ids[f.steps[i - 1].n] && !linked(f.steps[i - 1].n, st.n))
          console.warn('[maps] ' + m.id + ' / ' + f.name + ': no link between "' + f.steps[i - 1].n + '" and "' + st.n + '" (step ' + i + ' to ' + (i + 1) + ')');
      });
    });
  });

  // ---------- DOM ----------
  var svg = root.querySelector('.topo-svg'), side = root.querySelector('.topo-side'), tip = root.querySelector('.topo-tip'),
    legend = root.querySelector('.topo-legend'), live = root.querySelector('.topo-live'), body = root.querySelector('.topo-body'),
    fullBtn = root.querySelector('[data-act=full]'), tabs = [].slice.call(root.querySelectorAll('[role=tab]'));
  svg.innerHTML = '<defs><pattern id="t-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle class="t-dot" cx="2" cy="2" r="1"/></pattern>' +
    '<filter id="t-glow" x="-3" y="-3" width="7" height="7"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#t-grid)"/><g class="t-world"></g><g class="t-packets"></g>';
  var world = svg.querySelector('.t-world'), packets = svg.querySelector('.t-packets');
  var S = { m: null, N: {}, vb: null, layers: {}, flow: null, step: -1, playing: false, timer: 0, tok: 0, movers: [], pk: null, x: null, sel: null, visible: false, raf: 0, lastAmb: 0, moved: false };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- geometry ----------
  function seg(p, i) { return Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); }
  function plen(p) { for (var s = 0, i = 1; i < p.length; i++) s += seg(p, i); return s; }
  function at(p, d) {
    for (var i = 1; i < p.length; i++) {
      var s = seg(p, i);
      if (d <= s || i === p.length - 1) { var f = s ? Math.max(0, Math.min(d / s, 1)) : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f]; }
      d -= s;
    }
    return p[0];
  }
  function sub(p, d0, d1) {
    var out = [at(p, d0)], acc = 0;
    for (var i = 1; i < p.length - 1; i++) { acc += seg(p, i); if (acc > d0 && acc < d1) out.push(p[i]); }
    out.push(at(p, d1));
    return out;
  }
  function inside(q, n) { return Math.abs(q[0] - n.x) <= W / 2 && Math.abs(q[1] - n.y) <= H / 2; }
  // cut the parts of a path hidden under its two end cards, so packets travel only on visible line
  function trim(p, a, b) {
    var L = plen(p), d0 = 0, d1 = L;
    while (d0 < L && inside(at(p, d0), a)) d0 += 2;
    while (d1 > d0 && inside(at(p, d1), b)) d1 -= 2;
    return sub(p, d0, d1);
  }
  function route(l) {
    var a = S.N[l.a], b = S.N[l.b], pa = l.pa || [0, 0], pb = l.pb || [0, 0],
      A = [a.x + pa[0], a.y + pa[1]], B = [b.x + pb[0], b.y + pb[1]], v = l.via;
    if (!v) {
      if (A[0] === B[0] || A[1] === B[1]) v = [];
      else { var my = l.my != null ? l.my : (A[1] + B[1]) / 2; v = [[A[0], my], [B[0], my]]; }
    }
    return [A].concat(v, [B]);
  }
  function linkOf(a, b) { for (var i = 0; i < S.m.links.length; i++) { var l = S.m.links[i]; if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return l; } }
  function pathBetween(a, b) {
    var l = linkOf(a, b), p = l ? (l.a === a ? l.pts : l.pts.slice().reverse()) : [[S.N[a].x, S.N[a].y], [S.N[b].x, S.N[b].y]];
    return trim(p, S.N[a], S.N[b]);
  }

  // ---------- drawing ----------
  function tag(parent, x, y, text, cls, anchor) {
    var g = el('g', { 'class': 't-tag ' + cls }, parent), bg = el('rect', { rx: cls === 't-pill' ? 8 : 3 }, g),
      t = el('text', { x: x, y: y, 'text-anchor': anchor || 'start' }, g);
    String(text).split('\n').forEach(function (line, i) { var s = el('tspan', { x: x, dy: i ? 12 : 0 }, t); s.textContent = line; });
    try { var b = t.getBBox(); bg.setAttribute('x', b.x - 4); bg.setAttribute('y', b.y - 2); bg.setAttribute('width', b.width + 8); bg.setAttribute('height', b.height + 4); } catch (e) {}
    return g;
  }
  function txt(p, x, y, s, cls, max) {
    var t = el('text', { 'class': cls, x: x, y: y }, p), str = s;
    t.textContent = s;
    try { while (str.length > 3 && t.getComputedTextLength() > max) { str = str.slice(0, -1); t.textContent = str + '…'; } } catch (e) {}
    return t;
  }
  function longest(p) {
    for (var best = -1, bi = 1, i = 1; i < p.length; i++) { var d = seg(p, i); if (d > best) { best = d; bi = i; } }
    return [p[bi - 1], p[bi]];
  }
  function linkLabel(l, gt) {
    if (l.lp) return tag(gt, l.lp[0], l.lp[1], l.label, 't-label', l.la || 'start');
    var s = longest(l.pts), mx = (s[0][0] + s[1][0]) / 2, my = (s[0][1] + s[1][1]) / 2, side = l.side || 1;
    if (s[0][0] === s[1][0]) return tag(gt, mx + 8 * side, my + 4, l.label, 't-label', side > 0 ? 'start' : 'end');
    return tag(gt, mx, my + (side > 0 ? -8 : 16), l.label, 't-label', 'middle');
  }
  function badge(gt, l, start) {
    var p = l.pts, a = start ? p[0] : p[p.length - 1], b = start ? p[1] : p[p.length - 2], vert = a[0] === b[0];
    if (start && l.my != null && vert) { // each switch link has its own row, so its badge sits on that row
      var left = S.N[l.b].x < a[0];
      return tag(gt, a[0] + (left ? -6 : 6), l.my - 5, l.ifA, 't-badge', left ? 'end' : 'start');
    }
    var f = Math.min(((vert ? H : W) / 2 + 12) / Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5),
      x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, s = start ? l.ifA : l.ifB;
    return vert ? tag(gt, x + 6, y + 4, s, 't-badge', 'start') : tag(gt, x, y - 6, s, 't-badge', 'middle');
  }
  function pill(gt, l) {
    var p = l.pts, P;
    if (l.vp != null) P = at(p, plen(p) * l.vp);
    else { var a = p[p.length - 2], b = p[p.length - 1], f = Math.min(20 / Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5); P = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
    return tag(gt, P[0], P[1] + 3.5, l.vlan, 't-pill', 'middle');
  }

  function render() {
    var m = S.m, L = S.layers;
    world.textContent = '';
    var gz = el('g', {}, world), gl = el('g', {}, world), gh = el('g', {}, world), gt = el('g', {}, world), gn = el('g', {}, world);
    m.zones.forEach(function (z) {
      el('rect', { 'class': 't-zone', x: z.x, y: z.y, width: z.w, height: z.h, rx: 14 }, gz);
      // header strip sits above the links, so lines pass "under" the zone name
      el('path', { 'class': 't-zhead', d: 'M' + z.x + ' ' + (z.y + 36) + 'V' + (z.y + 14) + 'Q' + z.x + ' ' + z.y + ' ' + (z.x + 14) + ' ' + z.y + 'H' + (z.x + z.w - 14) + 'Q' + (z.x + z.w) + ' ' + z.y + ' ' + (z.x + z.w) + ' ' + (z.y + 14) + 'V' + (z.y + 36) + 'Z' }, gh);
      el('rect', { 'class': 't-zborder', x: z.x, y: z.y, width: z.w, height: z.h, rx: 14 }, gh);
      txt(gh, z.x + 14, z.y + (L.vlan ? 16 : 23), z.name, 't-zname', z.w - 24);
      if (L.vlan) txt(gh, z.x + 14, z.y + 30, z.meta, 't-zmeta', z.w - 24);
    });
    m.links.forEach(function (l, i) {
      var pts = l.pts = route(l), d = 'M' + pts.map(function (q) { return q[0] + ',' + q[1]; }).join('L');
      l.el = el('path', { 'class': 't-link' + (l.dash ? ' dash' : '') + (l.thick ? ' thick' : ''), d: d }, gl);
      el('path', { 'class': 't-hit', d: d, 'data-l': i }, gl);
      l.tags = [];
      if (L.ports && l.label) l.tags.push(linkLabel(l, gt));
      if (L.vlan && l.vlan) l.tags.push(pill(gt, l));
      if (L.ifn && l.ifA) l.tags.push(badge(gt, l, true));
      if (L.ifn && l.ifB) l.tags.push(badge(gt, l, false));
    });
    (m.pills || []).forEach(function (p) { tag(gt, p.x, p.y + 3.5, p.text, 't-pill', 'middle'); });
    m.nodes.forEach(function (n) {
      var g = el('g', { 'class': 't-node' + (n.planned ? ' planned' : ''), transform: 'translate(' + n.x + ',' + n.y + ')', tabindex: 0, role: 'button', 'data-n': n.id, 'aria-label': n.host + ', ' + n.role + '. Show details' }, gn),
        lift = el('g', { 'class': 't-lift' }, g), ip = L.ip && n.ip, x0 = -W / 2 + 44, ys = ip ? [-9, 5, 19] : [-3, 12];
      el('rect', { 'class': 't-ring', x: -W / 2, y: -H / 2, width: W, height: H, rx: 10 }, lift);
      el('rect', { 'class': 't-card', x: -W / 2, y: -H / 2, width: W, height: H, rx: 10 }, lift);
      el('g', { 'class': 't-ico', transform: 'translate(' + (-W / 2 + 12) + ',-11) scale(.92)' }, lift).innerHTML = ICON[n.t];
      if (n.st) el('circle', { 'class': 't-led led-' + n.st, cx: -W / 2 + 9, cy: -H / 2 + 9, r: 3.5 }, lift);
      txt(lift, x0, ys[0], n.host, 't-host', W - 52);
      txt(lift, x0, ys[1], n.role, 't-role', W - 52);
      if (ip) txt(lift, x0, ys[2], n.ip, 't-ip', W - 52);
      n.el = g;
    });
    if (S.sel) S.N[S.sel].el.classList.add('sel');
    paintFlow();
  }

  function renderLegend() {
    var seen = {}, types = [], sts = [];
    S.m.nodes.forEach(function (n) {
      if (!seen[n.t]) { seen[n.t] = 1; types.push(n.t); }
      if (n.st && sts.indexOf(n.st) < 0) sts.push(n.st);
    });
    var ico = function (t) { return '<li><svg class="lg-ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[t] + '</svg>' + TYPE[t] + '</li>'; },
      line = function (c, t) { return '<li><svg width="30" height="10" aria-hidden="true"><line class="lg-line ' + c + '" x1="1" y1="5" x2="29" y2="5"/></svg>' + t + '</li>'; };
    legend.innerHTML = '<ul aria-label="Device types">' + types.map(ico).join('') + '</ul>' +
      '<ul aria-label="Links and status">' + line('', 'Active') + line('lg-dash', 'Planned / in progress') + line('lg-thick', 'Trunk / 10 GbE') + line('lg-bad', 'Blocked') +
      sts.map(function (s) { return '<li><span class="lg-led led-' + s + '" aria-hidden="true"></span>' + STATUS[s] + '</li>'; }).join('') + '</ul>';
  }

  // ---------- view: pan & zoom ----------
  function setVB() { var v = S.vb; svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h); }
  function fit() { S.vb = { x: -20, y: -20, w: S.m.w + 40, h: S.m.h + 40 }; S.vb0 = S.vb.w; setVB(); }
  function clampVB() {
    var v = S.vb, cx = Math.min(Math.max(v.x + v.w / 2, 0), S.m.w), cy = Math.min(Math.max(v.y + v.h / 2, 0), S.m.h);
    v.x = cx - v.w / 2; v.y = cy - v.h / 2;
  }
  function zoomAt(px, py, f) {
    var v = S.vb, nw = Math.min(Math.max(v.w / f, S.vb0 / 4), S.vb0 * 1.25), r = nw / v.w;
    v.x = px - (px - v.x) * r; v.y = py - (py - v.y) * r; v.w = nw; v.h *= r;
    clampVB(); setVB();
  }
  function toSvg(x, y) { var p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function zoomCenter(f) { zoomAt(S.vb.x + S.vb.w / 2, S.vb.y + S.vb.h / 2, f); }

  var ptrs = {}, pinch = null;
  svg.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    S.moved = false; pinch = null;
  });
  svg.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId], ids = Object.keys(ptrs);
    if (!p) return;
    if (ids.length === 1) {
      if (e.pointerType === 'touch') return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!S.moved && Math.hypot(dx, dy) < 5) return;
      if (!S.moved) { S.moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('grabbing'); hideTip(); }
      var k = svg.getScreenCTM().a;
      S.vb.x -= dx / k; S.vb.y -= dy / k; clampVB(); setVB();
      p.x = e.clientX; p.y = e.clientY;
    } else if (ids.length === 2) {
      p.x = e.clientX; p.y = e.clientY; S.moved = true;
      var a = ptrs[ids[0]], b = ptrs[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch) {
        var k2 = svg.getScreenCTM().a;
        S.vb.x -= (cx - pinch.cx) / k2; S.vb.y -= (cy - pinch.cy) / k2; // two fingers also pan
        var c = toSvg(cx, cy); zoomAt(c.x, c.y, dist / pinch.d);
      }
      pinch = { d: dist, cx: cx, cy: cy };
    }
  });
  function up(e) { delete ptrs[e.pointerId]; pinch = null; svg.classList.remove('grabbing'); }
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // the page must stay scrollable: wheel zooms only with Ctrl/⌘ (a trackpad pinch also sends ctrlKey), one finger scrolls
  var hintEl = root.querySelector('.topo-hint'), hintTimer;
  function hint(msg) {
    hintEl.textContent = msg; hintEl.classList.add('show');
    clearTimeout(hintTimer); hintTimer = setTimeout(function () { hintEl.classList.remove('show'); }, 1600);
  }
  svg.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) { hint('Ctrl/⌘ + scroll to zoom'); return; }
    e.preventDefault();
    var c = toSvg(e.clientX, e.clientY);
    zoomAt(c.x, c.y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
  }, { passive: false });
  svg.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) { if (e.cancelable) e.preventDefault(); } // two fingers belong to the map
    else hint('Use two fingers to move the map');
  }, { passive: false });
  svg.addEventListener('dblclick', function (e) { if (!e.target.closest('.t-node')) fit(); });

  // ---------- hover, tooltip, selection ----------
  function mark(l) { l.el.classList.add('hl'); l.tags.forEach(function (t) { t.classList.add('hl'); }); S.N[l.a].el.classList.add('hl'); S.N[l.b].el.classList.add('hl'); }
  function clearHl() { svg.classList.remove('dim'); [].forEach.call(svg.querySelectorAll('.hl'), function (x) { x.classList.remove('hl'); }); }
  function hlNode(id) {
    clearHl(); svg.classList.add('dim'); S.N[id].el.classList.add('hl');
    S.m.links.forEach(function (l) { if (l.a === id || l.b === id) mark(l); });
  }
  function showTip(l, e) {
    var lines = [S.N[l.a].host + ' ↔ ' + S.N[l.b].host, (l.label || l.tip || '').replace('\n', ' · '), l.speed, l.proto].filter(Boolean);
    tip.innerHTML = lines.map(function (s, i) { return i ? esc(s) : '<strong>' + esc(s) + '</strong>'; }).join('<br>');
    tip.hidden = false; placeTip(e);
  }
  function placeTip(e) {
    var r = svg.getBoundingClientRect(), x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    tip.style.left = Math.min(x, r.width - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(y, r.height - tip.offsetHeight - 8) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  svg.addEventListener('mouseover', function (e) {
    if (svg.classList.contains('grabbing')) return;
    var n = e.target.closest('.t-node'), h = e.target.closest('.t-hit');
    if (n) { hlNode(n.dataset.n); hideTip(); }
    else if (h) { var l = S.m.links[+h.dataset.l]; clearHl(); svg.classList.add('dim'); mark(l); showTip(l, e); }
  });
  svg.addEventListener('mouseout', function (e) {
    var from = e.target.closest('.t-node, .t-hit');
    if (!from || (e.relatedTarget && from.contains(e.relatedTarget))) return;
    clearHl(); hideTip();
  });
  svg.addEventListener('mousemove', function (e) { if (!tip.hidden) placeTip(e); });
  svg.addEventListener('focusin', function (e) { var n = e.target.closest('.t-node'); if (n) hlNode(n.dataset.n); });
  svg.addEventListener('focusout', clearHl);
  svg.addEventListener('click', function (e) {
    if (S.moved) return;
    var n = e.target.closest('.t-node');
    if (n) details(n.dataset.n);
  });
  svg.addEventListener('keydown', function (e) {
    var n = e.target.closest('.t-node');
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); details(n.dataset.n); return; }
    if (e.target !== svg) return;
    // keyboard pan / zoom while the map itself has focus
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) { e.preventDefault(); S.vb.x += d[0] * S.vb.w * 0.1; S.vb.y += d[1] * S.vb.h * 0.1; clampVB(); setVB(); }
    else if (e.key === '+' || e.key === '=') zoomCenter(1.3);
    else if (e.key === '-') zoomCenter(1 / 1.3);
  });

  // ---------- side panel ----------
  function back() { return '<button type="button" class="tp-back" data-act="overview">← Overview</button>'; }
  function list(t, arr) { return arr && arr.length ? '<h4>' + t + '</h4><ul class="tp-list">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function setSel(id) {
    if (S.sel && S.N[S.sel].el) S.N[S.sel].el.classList.remove('sel');
    S.sel = id;
    if (id) S.N[id].el.classList.add('sel');
  }
  function overview() {
    var m = S.m;
    setSel(null);
    side.innerHTML = '<p class="tp-kicker">Overview</p><h3>' + esc(m.name) + '</h3>' +
      '<p class="tp-meta"><span class="tp-badge s-' + m.status + '">' + esc(m.badge) + '</span><span>' + esc(m.note) + '</span></p>' +
      '<p>' + esc(m.summary) + '</p><p class="tp-count">Devices on map: <strong>' + m.nodes.length + '</strong></p>' +
      (m.flows.length ? '<h4>Traffic flows</h4><ul class="tp-flows">' + m.flows.map(function (f, i) { return '<li><button type="button" data-flow="' + i + '">▶ ' + esc(f.name) + '</button></li>'; }).join('') + '</ul>' : '') +
      '<p class="tp-hint">Select a device on the map to see its details.</p>';
  }
  function details(id) {
    stopFlow();
    var n = S.N[id], conns = S.m.links.filter(function (l) { return l.a === id || l.b === id; }).map(function (l) {
      var o = S.N[l.a === id ? l.b : l.a], t = (l.label || l.tip || '').replace('\n', ' · ');
      return o.host + (t ? ' · ' + t : '');
    });
    setSel(id);
    side.innerHTML = back() +
      '<div class="tp-dev"><svg class="tp-ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n.t] + '</svg><div><h3>' + esc(n.host) + '</h3><p>' + esc(n.role) + '</p></div></div>' +
      '<p class="tp-meta"><span class="tp-badge s-' + (n.st || 'ext') + '">' + STATUS[n.st || 'ext'] + '</span><span>' + TYPE[n.t] + '</span></p>' +
      list('IP addresses', n.ips) + list('Interfaces', n.ifs) + list('Services & ports', n.svc) + list('Connections', conns) +
      (n.why ? '<p class="tp-why"><strong>Why it’s designed this way:</strong> ' + esc(n.why) + '</p>' : '');
    live.textContent = 'Details: ' + n.host;
  }
  function flowPanel() {
    var f = S.flow, k = S.step, last = f.steps.length - 1, I = Object.assign({}, f.insp, f.steps[k].insp), rows = [];
    if (I.proto) rows.push(['Protocol', I.proto]);
    if (I.src || I.dst) rows.push(['Source → destination', (I.src || '') + ' → ' + (I.dst || '')]);
    if (I.vlan) rows.push(['VLAN tag', I.vlan]);
    if (I.nat) rows.push(['NAT', I.nat]);
    if (I.policy) rows.push(['Firewall policy', I.policy]);
    side.innerHTML = back() + '<p class="tp-kicker">Traffic flow</p><h3>' + esc(f.name) + '</h3>' +
      '<div class="tp-ctrl"><button type="button" data-act="prev"' + (k ? '' : ' disabled') + '>◀ Prev</button>' +
      '<button type="button" data-act="play">' + (S.playing ? 'Pause' : k === last ? 'Replay' : 'Play') + '</button>' +
      '<button type="button" data-act="next"' + (k < last ? '' : ' disabled') + '>Next ▶</button></div>' +
      '<ol class="tp-steps">' + f.steps.map(function (s, i) {
        return '<li' + (i === k ? ' class="cur" aria-current="step"' : i < k ? ' class="done"' : '') + '><button type="button" data-step="' + i + '">' + esc(s.t) + '</button></li>';
      }).join('') + '</ol>' +
      '<div class="tp-insp"><p class="tp-kicker">Packet inspector · step ' + (k + 1) + ' of ' + f.steps.length + '</p>' +
      (rows.length ? '<dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' : '<p class="tp-hint">No packet details documented for this hop.</p>') + '</div>';
  }
  side.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !S.m) return;
    var a = b.dataset.act, focus = '[data-act=play]';
    if (b.dataset.flow != null) startFlow(+b.dataset.flow);
    else if (b.dataset.step != null) { S.playing = false; goStep(+b.dataset.step, false); focus = '[data-step="' + b.dataset.step + '"]'; }
    else if (a === 'overview') { stopFlow(); overview(); focus = '[data-flow]'; }
    else if (a === 'prev') { S.playing = false; goStep(S.step - 1, false); focus = '[data-act=prev]:not(:disabled)'; }
    else if (a === 'next') { S.playing = false; goStep(S.step + 1, true); focus = '[data-act=next]:not(:disabled)'; }
    else if (a === 'play') {
      if (S.playing) { S.playing = false; clearTimeout(S.timer); flowPanel(); }
      else { S.playing = true; if (S.step >= S.flow.steps.length - 1) goStep(0, false); else goStep(S.step + 1, true); }
    }
    var f = side.querySelector(focus) || side.querySelector('[data-act=play]');
    if (f) f.focus({ preventScroll: true }); // on phones the panel sits below the map; keep the animation in view
  });

  // ---------- flows & packets ----------
  function loop() { if (!S.raf && S.visible && !document.hidden) S.raf = requestAnimationFrame(tick); }
  function tick(now) {
    S.raf = 0;
    S.movers = S.movers.filter(function (mv) {
      var p = Math.min((now - mv.t0) / mv.dur, 1), q = at(mv.pts, mv.len * p);
      mv.el.setAttribute('cx', q[0]); mv.el.setAttribute('cy', q[1]);
      if (p < 1) return true;
      if (mv.amb) mv.el.remove();
      if (mv.done) mv.done();
      return false;
    });
    var amb = !S.flow && !reduce;
    if (amb && now - S.lastAmb > 900) { S.lastAmb = now; ambient(); }
    if (amb || S.movers.length) loop(); // otherwise move() or stopFlow() restarts it
  }
  function move(c, pts, dur, extra) {
    var mv = { el: c, pts: pts, len: plen(pts), t0: performance.now(), dur: dur };
    for (var k in extra) mv[k] = extra[k];
    S.movers.push(mv); loop();
  }
  function ambient() {
    var ls = S.m.links.filter(function (l) { return !l.dash; }), n = S.movers.filter(function (m) { return m.amb; }).length;
    if (n >= 3 || !ls.length) return;
    var l = ls[Math.random() * ls.length | 0], pts = trim(l.pts, S.N[l.a], S.N[l.b]);
    if (Math.random() < 0.5) pts.reverse();
    move(el('circle', { 'class': 't-amb', r: 2.5 }, packets), pts, plen(pts) / 0.11, { amb: 1 });
  }
  function clearMovers(amb) {
    S.movers = S.movers.filter(function (m) {
      if (!!m.amb !== amb) return true;
      if (amb) m.el.remove();
      return false;
    });
  }
  function removeX() { if (S.x) { S.x.remove(); S.x = null; } }
  function startFlow(i) {
    stopFlow(); clearMovers(true); setSel(null);
    S.flow = S.m.flows[i]; S.playing = true;
    S.pk = el('circle', { 'class': 't-pk', r: 6, filter: 'url(#t-glow)' }, packets);
    goStep(0, false);
  }
  function stopFlow() {
    clearTimeout(S.timer); S.tok++; clearMovers(false);
    if (S.pk) S.pk.remove();
    removeX();
    S.pk = null; S.flow = null; S.step = -1; S.playing = false;
    paintFlow(); loop();
  }
  function goStep(k, animate) {
    var f = S.flow, prev = S.step, st = f.steps[k], tok = ++S.tok, n = S.N[st.n];
    clearTimeout(S.timer); clearMovers(false); removeX();
    S.pk.classList.remove('bad');
    S.step = k; paintFlow(); flowPanel();
    live.textContent = 'Step ' + (k + 1) + ' of ' + f.steps.length + ': ' + st.t;
    function arrived() {
      if (tok !== S.tok) return;
      pulse(n);
      if (st.block) {
        S.pk.classList.add('bad');
        S.x = el('g', { 'class': 't-x', transform: 'translate(' + (n.x + W / 2 - 4) + ',' + (n.y - H / 2 + 4) + ')' }, packets);
        el('circle', { r: 11 }, S.x); el('path', { d: 'M-4.5-4.5L4.5 4.5M4.5-4.5L-4.5 4.5' }, S.x);
      }
      if (S.playing) S.timer = setTimeout(function () {
        if (tok !== S.tok) return;
        if (k < f.steps.length - 1) goStep(k + 1, true); else { S.playing = false; flowPanel(); }
      }, reduce ? 1600 : 550);
    }
    var from = prev >= 0 ? f.steps[prev].n : null;
    if (animate && !reduce && from && from !== st.n && Math.abs(k - prev) === 1) move(S.pk, pathBetween(from, st.n), 700, { done: arrived });
    else {
      var q = from && from !== st.n ? pathBetween(from, st.n).pop() : [n.x, n.y - H / 2];
      S.pk.setAttribute('cx', q[0]); S.pk.setAttribute('cy', q[1]);
      arrived();
    }
  }
  function pulse(n) {
    if (reduce || !n.el) return;
    n.el.classList.remove('pulse');
    void n.el.getBBox();
    n.el.classList.add('pulse');
    setTimeout(function () { n.el.classList.remove('pulse'); }, 700);
  }
  function paintFlow() {
    var m = S.m;
    if (!m) return;
    m.links.forEach(function (l) { if (l.el) l.el.classList.remove('flow', 'blocked'); });
    m.nodes.forEach(function (n) { if (n.el) n.el.classList.remove('cur'); });
    svg.classList.toggle('flowing', !!S.flow);
    if (!S.flow || S.step < 0) return;
    var st = S.flow.steps;
    for (var k = 1; k <= S.step; k++) {
      var l = st[k - 1].n !== st[k].n && linkOf(st[k - 1].n, st[k].n);
      if (l && l.el) l.el.classList.add(st[k].block ? 'blocked' : 'flow');
    }
    if (S.N[st[S.step].n].el) S.N[st[S.step].n].el.classList.add('cur');
  }

  // ---------- maps, tabs, toolbar ----------
  function selectMap(id) {
    stopFlow(); clearMovers(true); hideTip();
    S.m = MAPS.filter(function (m) { return m.id === id; })[0] || MAPS[0];
    S.N = {}; S.sel = null;
    S.m.nodes.forEach(function (n) { S.N[n.id] = n; });
    tabs.forEach(function (t) {
      var on = t.dataset.map === S.m.id;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      if (on) body.setAttribute('aria-labelledby', t.id);
    });
    svg.setAttribute('aria-label', 'Network map: ' + S.m.name + '. Arrow keys pan, plus and minus zoom; Tab moves through the devices.');
    render(); fit(); overview(); renderLegend();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectMap(t.dataset.map); });
    t.addEventListener('keydown', function (e) {
      var k = { ArrowRight: 1, ArrowLeft: -1, Home: 'h', End: 'e' }[e.key];
      if (k == null) return;
      e.preventDefault();
      var j = k === 'h' ? 0 : k === 'e' ? tabs.length - 1 : (i + k + tabs.length) % tabs.length;
      tabs[j].focus(); selectMap(tabs[j].dataset.map);
    });
  });
  [].forEach.call(document.querySelectorAll('.map-link'), function (a) {
    a.addEventListener('click', function () { selectMap(a.dataset.map); });
  });

  function syncFull() {
    var on = document.fullscreenElement === root || root.classList.contains('is-full');
    fullBtn.setAttribute('aria-pressed', on);
    fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.classList.contains('is-full')) root.classList.remove('is-full');
    else if (root.requestFullscreen) root.requestFullscreen().catch(function () { root.classList.add('is-full'); syncFull(); });
    else root.classList.add('is-full'); // shortcut: iPhone Safari has no element fullscreen, so fill the viewport instead
    syncFull();
  }
  document.addEventListener('fullscreenchange', syncFull);
  root.querySelector('.tb-group').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    ({ zoomin: function () { zoomCenter(1.3); }, zoomout: function () { zoomCenter(1 / 1.3); }, fit: fit, full: toggleFull })[b.dataset.act]();
  });
  root.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (root.classList.contains('is-full')) { root.classList.remove('is-full'); syncFull(); }
    else if (S.flow || S.sel) { stopFlow(); overview(); }
  });

  var phone = matchMedia('(max-width: 640px)').matches;
  [].forEach.call(root.querySelectorAll('[data-layer]'), function (c) {
    var k = c.dataset.layer;
    c.checked = !phone || k === 'ip' || k === 'vlan';
    S.layers[k] = c.checked;
    c.addEventListener('change', function () { S.layers[k] = c.checked; render(); });
  });

  selectMap('msp');
  if (document.fonts) document.fonts.ready.then(render);
  new IntersectionObserver(function (es) { S.visible = es[0].isIntersecting; loop(); }).observe(root);
  document.addEventListener('visibilitychange', loop);
})();
