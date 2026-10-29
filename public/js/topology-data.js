/* Network Maps: the lab data (devices, links, flows). Every IP, port, VLAN and hostname comes from my own lab notes.
   topology.js draws it; it loads after this file. */
window.TOPO = (function () {
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
    id: 'msp', focus: [440, 250], name: 'Enterprise MSP Lab', status: 'wip', badge: 'In progress', note: 'Phases 1–2 complete · Phase 3 in progress',
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
    id: 'cloud', focus: [560, 300], name: 'Cloud Web & Email Lab', status: 'wip', badge: 'In progress', note: 'Oracle Cloud Always Free',
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
    id: 'cnet', focus: [800, 300], name: 'CNET Lab Redesign', status: 'design', badge: 'Design', note: 'Holland College coursework design',
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
      { id: 'h1', t: 'server', x: 745, y: 414, host: 'PSWSCL1', role: 'Hyper-V cluster node', st: 'design', ip: '172.16.9.11', ips: ['172.16.9.11 (management)', '172.16.60.21 (iSCSI)'], ifs: ['SET team Gi1/0/3 + Gi2/0/43 (trunk 9, 50, 201–224)', 'iSCSI on Te1/1/1'], svc: ['Hyper-V failover cluster node'], why: 'Two cluster nodes on shared iSCSI storage.' },
      { id: 'h2', t: 'server', x: 960, y: 414, host: 'PSWSCL2', role: 'Hyper-V cluster node', st: 'design', ip: '172.16.9.12', ips: ['172.16.9.12 (management)', '172.16.60.22 (iSCSI)'], ifs: ['SET team Gi1/0/5 + Gi2/0/44', 'iSCSI on Te2/1/1'], svc: ['Hyper-V failover cluster node'], why: 'Two cluster nodes on shared iSCSI storage.' },
      { id: 'esx', t: 'server', x: 545, y: 414, host: 'ESX1', role: 'VMware ESXi', st: 'design', ip: '172.16.9.13', ips: ['172.16.9.13', 'vCenter: 172.16.9.14'], ifs: ['Gi1/0/7 + Gi2/0/39 trunk'], svc: ['Hosts the web-course Linux VMs', 'Hosts DC2'] },
      { id: 'nas', t: 'storage', x: 645, y: 714, host: 'TrueNAS', role: 'iSCSI target', st: 'design', ip: '172.16.60.10', ips: ['172.16.60.10 (storage)', '172.16.9.15 (management)'], ifs: ['2× 10 GbE LACP on Te1/1/2 + Te2/1/2'], svc: ['iSCSI target with CHAP for the cluster', 'Mirror pool'], why: 'Shared storage for the cluster on a VLAN that is not routed.' },
      { id: 'pcs', t: 'workstation', x: 1200, y: 414, host: 'Lab PCs', role: '24 × Windows 11', st: 'design', svc: ['24 Windows 11 PCs', 'DHCP reservations .10+N'] },
      { id: 'stu', t: 'users', x: 1465, y: 414, host: 'Student VLANs', role: 'One per student', st: 'design', svc: ['One isolated network per student', 'Student domain sN.lab.local', "DHCP/DNS from the student's own DC VM"], why: 'Each student gets an isolated network; the FortiGate denies traffic between student VLANs.' }
    ],
    links: [
      { a: 'fgt', b: 'sw', thick: 1, label: '802.1Q trunk · LACP', side: -1, ifB: 'Gi1/0/23 · Gi2/0/48', vlan: 'native VLAN 999', vp: 0.3, proto: '802.1Q · LACP' },
      { a: 'sw', b: 'ap', pa: [-80, 0], my: 250, ifA: 'Gi1/0/22', vlan: 'VLAN 9, 98', vp: 0.4, proto: '802.1Q trunk' },
      { a: 'sw', b: 'dc1', pa: [-56, 0], my: 272, ifA: 'Gi1/0/1 · Gi2/0/47', proto: 'NIC team' },
      { a: 'sw', b: 'h1', pa: [-8, 0], my: 316, ifA: 'Gi1/0/3 · Gi2/0/43', vlan: 'VLAN 9, 50, 201–224', vp: 0.74, proto: 'SET team · trunk' },
      { a: 'sw', b: 'h2', pa: [10, 0], my: 316, ifA: 'Gi1/0/5 · Gi2/0/44', proto: 'SET team' },
      { a: 'sw', b: 'esx', pa: [-32, 0], my: 294, ifA: 'Gi1/0/7 · Gi2/0/39', proto: 'trunk' },
      { a: 'sw', b: 'nas', pa: [34, 0], via: [[834, 294], [1080, 294], [1080, 714]], tip: 'TrueNAS management · 172.16.9.15' },
      { a: 'sw', b: 'pcs', pa: [58, 0], my: 272 },
      { a: 'sw', b: 'stu', pa: [82, 0], my: 250 },
      { a: 'h1', b: 'nas', thick: 1, dash: 1, pa: [-44, 0], via: [[701, 644], [645, 644]], label: 'iSCSI · VLAN 60 · 10 GbE · MTU 9000', lp: [990, 636], la: 'end', ifA: 'Te1/1/1', ifB: 'Te1/1/2 · Te2/1/2', speed: '10 GbE', proto: 'iSCSI' },
      { a: 'h2', b: 'nas', thick: 1, dash: 1, pa: [44, 0], via: [[1004, 644], [645, 644]], tip: 'iSCSI · VLAN 60 · 10 GbE · MTU 9000', ifA: 'Te2/1/1', speed: '10 GbE', proto: 'iSCSI' },
      { a: 'h1', b: 'h2', thick: 1, pa: [40, 0], pb: [-40, 0], via: [[785, 472], [920, 472]], label: 'cluster / live migration\nVLAN 61 · 10 GbE DAC', lp: [852, 492], la: 'middle', speed: '10 GbE DAC' },
      { a: 'esx', b: 'dc2', via: [[545, 549]], label: 'VM on ESX1', lp: [450, 541] }
    ],
    flows: [
      { name: 'Student reaches own VM', insp: { vlan: 'VLAN 205', gw: '172.16.205.1' }, steps: [
        { n: 'stu', t: 'A student PC on VLAN 205 (172.16.205.0/24) sends to its server' },
        { n: 'sw', t: 'The switch tags it VLAN 205 up the trunk' },
        { n: 'fgt', t: "FortiGate policy: allow a student's own VLAN only", insp: { policy: "Allow a student's own VLAN only" } },
        { n: 'sw', t: 'Back down the trunk' },
        { n: 'h1', t: "Arrives at the student's VM on PSWSCL1" }] },
      { name: 'Cross-student blocked', steps: [
        { n: 'stu', t: "Student 05 tries student 07's network (172.16.207.0/24)", insp: { src: 'Student 05', dst: '172.16.207.0/24' } },
        { n: 'sw', t: 'Trunked to the FortiGate' },
        { n: 'fgt', t: 'BLOCKED: traffic between student VLANs is denied and logged', block: 1, insp: { policy: 'Traffic between student VLANs: denied and logged' } }] },
      { name: 'Lab PC sign-in', insp: { vlan: 'VLAN 99' }, steps: [
        { n: 'pcs', t: 'A lab PC on VLAN 99 signs in' },
        { n: 'fgt', via: ['sw'], t: 'Routed by the FortiGate (policy allows only AD services to the servers)', insp: { policy: 'Only AD services allowed to the servers' } },
        { n: 'dc1', via: ['sw'], t: 'DC1 at 172.16.50.200 authenticates it', insp: { dst: '172.16.50.200' } }] },
      { name: 'Storage path', insp: { proto: 'iSCSI', src: '172.16.60.21', dst: '172.16.60.10:3260', vlan: 'VLAN 60' }, steps: [
        { n: 'h1', t: 'A VM reads its disk' },
        { n: 'nas', t: 'iSCSI over the dedicated, non-routed VLAN 60 at 10 GbE with jumbo frames' },
        { n: 'nas', t: 'TrueNAS serves the block' }] },
      { name: 'Live migration', steps: [
        { n: 'h1', t: 'A VM moves between cluster nodes' },
        { n: 'h2', t: 'Over the direct 10 GbE cluster link (VLAN 61) without touching the switch', insp: { vlan: 'VLAN 61' } }] }
    ]
  }];

  return { ICON: ICON, TYPE: TYPE, STATUS: STATUS, MAPS: MAPS };
})();
