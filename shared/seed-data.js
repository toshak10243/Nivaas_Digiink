// Sample builder used by BOTH the server seed (server/db/seed.js) and the demo build of the client.
// Ids are short keys here; the server swaps them for UUIDs. Times are relative to "now".
// Media names refer to files in server/uploads/sample/ (and client/src/demo/media/).

const DAY = 864e5;
export function buildSeed(now = Date.now()) {
  let s = 20251015;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const ago = d => new Date(now - d * DAY).toISOString();
  const ahead = (d, h = 11) => { const x = new Date(now + d * DAY); x.setHours(h, 0, 0, 0); return x.toISOString(); };

  const org = {
    name: 'Shree Ganesh Developers', phone: '+91 141 400 2200', email: 'sales@sgdevelopers.in',
    address: 'C-42, Sardar Patel Marg, C-Scheme, Jaipur 302001', rera_promoter: 'RAJ/PROMOTER/2019/0412',
    settings: { routing: { assign_on: 'qualified', strategy: 'least_loaded', first_response_min: 15 } },
  };

  const users = [
    { id: 'admin', role: 'admin', name: 'Vikram Khandelwal', email: 'admin@sgdevelopers.in', phone: '919829011111', profile: {} },
    { id: 'rohit', role: 'sales', name: 'Rohit Sharma', email: 'rohit@sgdevelopers.in', phone: '919829022222',
      profile: { salary: 32000, incentive: { type: 'percent', value: 0.3 }, target_units: 3, availability: 'available', ai_twin: { mode: 'away', reply_after_min: 5 } } },
    { id: 'neha', role: 'sales', name: 'Neha Jain', email: 'neha@sgdevelopers.in', phone: '919829033333',
      profile: { salary: 28000, incentive: { type: 'flat', value: 25000 }, target_units: 2, availability: 'busy', ai_twin: { mode: 'always', reply_after_min: 3 } } },
    { id: 'arjun', role: 'sales', name: 'Arjun Meena', email: 'arjun@sgdevelopers.in', phone: '919829044444',
      profile: { salary: 26000, incentive: { type: 'percent', value: 0.25 }, target_units: 2, availability: 'away', ai_twin: { mode: 'away', reply_after_min: 5 } } },
    { id: 'b_sharma', role: 'broker', name: 'Rajesh Sharma', email: 'rajesh@sharmarealty.in', phone: '919414055555',
      profile: { firm: 'Sharma Realty', rera_agent_no: 'RAJ/A/2021/1187', city: 'Jaipur', commission: { type: 'percent', value: 2 } } },
    { id: 'b_jh', role: 'broker', name: 'Pooja Agarwal', email: 'pooja@jaipurhomes.co', phone: '919414066666',
      profile: { firm: 'Jaipur Homes', rera_agent_no: 'RAJ/A/2022/2290', city: 'Jaipur', commission: { type: 'percent', value: 1.5 } } },
    { id: 'b_ar', role: 'broker', name: 'Mohit Saini', email: 'mohit@ajmerroadproperties.in', phone: '919414077777',
      profile: { firm: 'Ajmer Road Properties', rera_agent_no: 'RAJ/A/2023/0951', city: 'Jaipur', commission: { type: 'flat', value: 100000 } } },
    { id: 'ajay', role: 'maintenance', name: 'Ajay Saini', email: 'ajay@sgdevelopers.in', phone: '919829088888', profile: { skills: ['plumbing', 'seepage', 'civil'] } },
    { id: 'sunil', role: 'maintenance', name: 'Sunil Kumar', email: 'sunil@sgdevelopers.in', phone: '919829099999', profile: { skills: ['electrical', 'lift'] } },
  ];

  const charges = { parking: 300000, club: 150000, maintenance_deposit: 75000, gst_pct: 5, stamp_pct: 6, registration: 30000 };
  const plan = [
    { milestone: 'On booking', pct: 10 }, { milestone: 'Within 30 days (agreement)', pct: 15 }, { milestone: 'On plinth', pct: 15 },
    { milestone: 'On 3rd floor slab', pct: 15 }, { milestone: 'On top slab', pct: 15 }, { milestone: 'On brickwork & plaster', pct: 15 }, { milestone: 'On possession', pct: 15 },
  ];

  const projects = [
    { id: 'saffron', name: 'Saffron Residency', tagline: '12 boutique 3 BHK homes, two per floor',
      description: 'A quiet, low-density building of just twelve 3 BHK homes, two on every floor, so every home gets cross-ventilation and a large private balcony. Rooftop pool, 2 covered parkings per home and a solar-powered common area.',
      location: 'Vaishali Nagar extension, off Ajmer Road', city: 'Jaipur', rera_no: 'RAJ/P/2025/3412', status: 'under_construction', possession: 'Dec 2027',
      rate_sqft: 5600, charges, payment_plan: plan, map_url: 'https://maps.google.com/?q=Vaishali+Nagar+Jaipur',
      amenities: ['Rooftop pool', '2 covered parkings', 'Solar common areas', 'EV charging', 'Video door phone', '24×7 security', 'Power backup', 'Gym'],
      highlights: ['Only 2 homes per floor', '8 min to Ajmer Road', '3 schools within 2 km', 'Vastu-compliant layouts'],
      cover: 'saffron-exterior.jpg', brochure: null,
      media: [['image', 'saffron-exterior.jpg', 'Front elevation'], ['image', 'saffron-dusk.jpg', 'Evening view'], ['video', 'walkthrough.mp4', 'Walkthrough video'],
        ['image', 'interior-living.jpg', 'Sample living room'], ['image', 'interior-bedroom.jpg', 'Sample master bedroom'], ['image', 'amenity-pool.jpg', 'Rooftop pool']],
      types: [
        { id: 'sf3', name: '3 BHK', bhk: 3, carpet_sqft: 1120, builtup_sqft: 1350, super_sqft: 1580, bathrooms: 3, balconies: 2, floorplan: 'fp-3bhk.png' },
        { id: 'sf3c', name: '3 BHK Corner', bhk: 3, carpet_sqft: 1180, builtup_sqft: 1420, super_sqft: 1650, bathrooms: 3, balconies: 2, floorplan: 'fp-3bhk-corner.png' },
      ],
      towers: [{ name: 'F', floors: 6, per_floor: 2, types: ['sf3', 'sf3c'], facing: ['East', 'North-East corner'], plc: [0, 2] }],
      updates: [
        { title: '4th floor slab cast', body: 'The 4th floor roof slab was cast on schedule. Brickwork on floors 1–3 is 60% complete.', days: 12 },
        { title: 'Plumbing & electrical conduits', body: 'Concealed conduits are going in on floors 1 and 2 before plaster.', days: 41 },
        { title: 'Plinth complete', body: 'Foundation and plinth work completed and inspected.', days: 120 },
      ],
      sales_pool: ['rohit', 'neha'],
    },
    { id: 'aravali', name: 'Aravali Heights', tagline: '2, 3 & 4 BHK in twin towers with a 1-acre central park',
      description: 'Two 10-storey towers around a landscaped central park, with a 12,000 sq ft clubhouse, pool and a dedicated kids’ zone. Ready-to-move phase planned by mid-2028.',
      location: 'Mansarovar extension, near Shipra Path', city: 'Jaipur', rera_no: 'RAJ/P/2024/2871', status: 'under_construction', possession: 'Jun 2028',
      rate_sqft: 4850, charges: { ...charges, parking: 250000, club: 125000 }, payment_plan: plan, map_url: 'https://maps.google.com/?q=Mansarovar+Jaipur',
      amenities: ['Clubhouse 12,000 sq ft', 'Swimming pool', '1-acre central park', 'Kids’ play zone', 'Jogging track', 'Indoor games', 'Gym', 'Multipurpose hall', 'Gated & CCTV'],
      highlights: ['1-acre central park', 'Metro station 2.5 km', 'Mansarovar market 5 min', 'Bank loans from 8.5%*'],
      cover: 'aravali-exterior.jpg', brochure: null,
      media: [['image', 'aravali-exterior.jpg', 'Twin towers'], ['image', 'aravali-siteplan.jpg', 'Site plan'], ['image', 'amenity-pool.jpg', 'Pool & clubhouse'],
        ['video', 'walkthrough.mp4', 'Sample flat walkthrough'], ['image', 'interior-living.jpg', 'Sample living room'], ['image', 'interior-bedroom.jpg', 'Sample bedroom']],
      types: [
        { id: 'ar2', name: '2 BHK', bhk: 2, carpet_sqft: 820, builtup_sqft: 980, super_sqft: 1150, bathrooms: 2, balconies: 1, floorplan: 'fp-2bhk.png' },
        { id: 'ar3', name: '3 BHK', bhk: 3, carpet_sqft: 1120, builtup_sqft: 1350, super_sqft: 1580, bathrooms: 3, balconies: 2, floorplan: 'fp-3bhk.png' },
        { id: 'ar4', name: '4 BHK', bhk: 4, carpet_sqft: 1600, builtup_sqft: 1920, super_sqft: 2250, bathrooms: 4, balconies: 3, floorplan: 'fp-4bhk.png' },
      ],
      towers: [
        { name: 'A', floors: 10, per_floor: 4, types: ['ar2', 'ar3', 'ar3', 'ar4'], facing: ['East', 'Park facing', 'Park facing', 'North corner'], plc: [0, 2.5, 2.5, 3] },
        { name: 'B', floors: 10, per_floor: 4, types: ['ar2', 'ar3', 'ar3', 'ar4'], facing: ['West', 'Park facing', 'Park facing', 'South corner'], plc: [0, 2.5, 2.5, 2] },
      ],
      updates: [
        { title: 'Tower A: 7th floor slab', body: 'Tower A has reached the 7th floor slab. Tower B is at the 5th floor.', days: 9 },
        { title: 'Clubhouse foundation started', body: 'Excavation and foundation for the clubhouse are under way.', days: 33 },
      ],
      sales_pool: [],
    },
  ];

  // ---------- units ----------
  const units = [];
  for (const p of projects) for (const tw of p.towers) for (let f = 1; f <= tw.floors; f++) for (let n = 1; n <= tw.per_floor; n++) {
    units.push({ id: `${p.id}:${f}${String(n).padStart(2, '0')}-${tw.name}`, project: p.id, tower: tw.name, type: tw.types[n - 1], unit_no: `${f}${String(n).padStart(2, '0')}-${tw.name}`,
      floor: f, facing: tw.facing[n - 1], plc_pct: (tw.plc[n - 1] || 0) + (f >= tw.floors - 1 ? 1 : 0), status: 'available' });
  }
  const U = no => units.find(u => u.unit_no === no);
  // Saffron: the 12-flat building from the brief
  Object.assign(U('101-F'), { status: 'sold' }); Object.assign(U('102-F'), { status: 'booked' }); Object.assign(U('201-F'), { status: 'booked' });
  Object.assign(U('301-F'), { status: 'hold', hold_by: 'neha', hold_hours: 20 }); Object.assign(U('402-F'), { status: 'booked' });
  Object.assign(U('602-F'), { status: 'blocked', notes: 'Reserved for the promoter' });
  // Aravali: roughly a third sold
  for (const u of units.filter(x => x.project === 'aravali')) {
    const r = rnd();
    if (r < 0.26) u.status = 'booked'; else if (r < 0.33) u.status = 'sold'; else if (r < 0.37) { u.status = 'hold'; u.hold_by = pick(['rohit', 'arjun', 'b_sharma']); u.hold_hours = 6 + Math.floor(rnd() * 40); }
  }

  // ---------- customers + bookings ----------
  const first = ['Ramesh', 'Kavita', 'Anil', 'Sunita', 'Deepak', 'Priya', 'Manish', 'Neelam', 'Sanjay', 'Rekha', 'Vivek', 'Pallavi', 'Gaurav', 'Swati', 'Rakesh', 'Meena', 'Amit', 'Shalini', 'Naveen', 'Anjali', 'Harish', 'Ritu', 'Pankaj', 'Seema', 'Yogesh', 'Kiran', 'Lokesh', 'Divya', 'Mukesh', 'Pooja'];
  const last = ['Gupta', 'Choudhary', 'Agarwal', 'Sharma', 'Jain', 'Meena', 'Saini', 'Khandelwal', 'Mathur', 'Rathore', 'Bansal', 'Singhal', 'Joshi', 'Verma', 'Yadav'];
  const sellers = [['rohit', null], ['neha', null], ['arjun', null], ['rohit', 'b_sharma'], ['neha', 'b_jh'], [null, 'b_ar'], ['arjun', 'b_sharma']];
  const bookings = [], customers = [];
  let ci = 0;
  for (const u of units.filter(x => ['booked', 'sold'].includes(x.status))) {
    const name = u.unit_no === '101-F' ? 'Ramesh Gupta' : u.unit_no === '102-F' ? 'Kavita Choudhary' : `${first[ci % first.length]} ${last[(ci * 7) % last.length]}`;
    const cid = 'c' + ci++;
    const email = u.unit_no === '101-F' ? 'ramesh.gupta@gmail.com' : `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${ci}@gmail.com`;
    customers.push({ id: cid, role: 'customer', name, email, phone: '9198' + String(10000000 + Math.floor(rnd() * 89999999)), profile: {} });
    const [sold_by, broker] = u.unit_no === '101-F' ? ['rohit', null] : u.unit_no === '102-F' ? ['neha', 'b_jh'] : pick(sellers);
    const days = u.unit_no === '101-F' ? 170 : Math.floor(rnd() * 175) + 3;
    const discount = rnd() < 0.4 ? pick([50000, 75000, 100000, 150000]) : 0;
    bookings.push({ id: 'bk' + ci, unit: u.id, customer: cid, sold_by, broker, discount, days_ago: days, status: u.status === 'sold' ? 'registered' : pick(['booked', 'agreement', 'agreement']),
      paid_pct: u.status === 'sold' ? 55 : pick([10, 25, 25, 40]) });
  }

  // ---------- leads ----------
  const leadNames = ['Sandeep Bansal', 'Aarti Joshi', 'Mahendra Singh', 'Nisha Mathur', 'Karan Rathore', 'Sneha Verma', 'Tarun Agarwal', 'Bhavna Sharma', 'Rahul Yadav', 'Ankita Jain', 'Manoj Kumawat', 'Jyoti Saini', 'Vikas Goyal', 'Preeti Khandelwal', 'Ashok Meena', 'Ritika Singhal', 'Hemant Choudhary', 'Komal Gupta', 'Suresh Bairwa', 'Tanvi Mehta', 'Nitin Sharma', 'Payal Agrawal', 'Dinesh Prajapat', 'Shruti Mathur'];
  const stages = ['new', 'contacted', 'contacted', 'qualified', 'qualified', 'visit_scheduled', 'visit_scheduled', 'visit_done', 'negotiation', 'negotiation', 'lost'];
  const sources = ['leadsathi', 'leadsathi', 'leadsathi', 'share_link', 'broker', 'walk_in', 'whatsapp'];
  const leads = leadNames.map((name, i) => {
    const src = i < 3 ? 'leadsathi' : pick(sources);
    const stage = i === 0 ? 'qualified' : i === 1 ? 'visit_scheduled' : i === 2 ? 'new' : pick(stages);
    const broker = src === 'broker' ? pick(['b_sharma', 'b_jh', 'b_ar']) : null;
    const assigned = stage === 'new' ? null : broker && rnd() < 0.5 ? broker : pick(['rohit', 'rohit', 'neha', 'arjun']);
    const project = rnd() < 0.45 ? 'saffron' : 'aravali';
    const cfg = project === 'saffron' ? '3 BHK' : pick(['2 BHK', '3 BHK', '3 BHK', '4 BHK']);
    const budget = { '2 BHK': '₹55–65 L', '3 BHK': pick(['₹85–95 L', '₹90 L–1 Cr', '₹80–90 L']), '4 BHK': '₹1.2–1.4 Cr' }[cfg];
    return {
      id: 'l' + i, name, phone: '9197' + String(10000000 + Math.floor(rnd() * 89999999)), project, source: src, stage,
      temperature: ['visit_scheduled', 'negotiation', 'visit_done'].includes(stage) || i < 2 ? 'hot' : stage === 'lost' ? 'cold' : pick(['warm', 'warm', 'hot']),
      budget, config_pref: cfg, purpose: pick(['Self use', 'Self use', 'Investment']), timeline: pick(['Within 1 month', '2–3 months', 'This year']),
      assigned, broker, days_ago: i < 3 ? 0.02 + i * 0.03 : Math.floor(rnd() * 40) + 1,
      unit: i === 1 ? 'saffron:302-F' : null, lost_reason: stage === 'lost' ? pick(['Budget mismatch', 'Bought elsewhere', 'Not reachable']) : null,
      ai_summary: src === 'leadsathi' ? `Wants a ${cfg} around ${budget}, ${pick(['for self use', 'as an investment'])}. ${stage === 'visit_scheduled' ? 'Agreed to a site visit.' : 'Asked about price and payment plan.'}` : null,
    };
  });
  leads[0].name = 'Sandeep Bansal'; leads[0].ai_summary = 'Family of 4, wants a 3 BHK at Saffron Residency on a higher floor. Budget ₹95 L–1 Cr, self use. Asked for a visit this weekend.';
  leads[1].ai_summary = 'Interested in 302-F at Saffron Residency. Budget ₹90 L–1 Cr. Site visit booked for tomorrow 11 am.';

  const visits = [
    { lead: 'l1', when: ahead(1, 11), agent: leads[1].assigned, status: 'scheduled' },
    ...leads.filter(l => l.stage === 'visit_scheduled' && l.id !== 'l1').map((l, i) => ({ lead: l.id, when: ahead(i % 5, 10 + (i % 6)), agent: l.assigned, status: 'scheduled' })),
    ...leads.filter(l => ['visit_done', 'negotiation'].includes(l.stage)).map(l => ({ lead: l.id, when: ago(3 + Math.floor(rnd() * 10)), agent: l.assigned, status: 'done', feedback: pick(['Liked the layout, wants a better floor', 'Comparing with one more project', 'Spouse to visit once more']) })),
  ];

  const chats = [
    { id: 'ch1', lead: 'l1', agent: 'rohit', ai: true, messages: [
      ['system', 'Intro sent from Rohit Sharma’s WhatsApp', 30], ['customer', 'Hi Rohit ji, 302-F abhi available hai?', 26],
      ['ai', 'Namaste! Haan, 302-F (3 BHK, 3rd floor, East facing) abhi available hai. All-inclusive price lagbhag ₹1.0 Cr hai (stamp duty alag). Aap kab site visit kar sakte hain?', 21],
      ['customer', 'Kal 11 baje theek rahega', 19], ['ai', 'Done! Kal 11 baje ka site visit book kar diya hai. Main aapko location bhej raha hoon. Koi aur sawal ho to batayein 🙏', 18],
    ] },
    { id: 'ch2', lead: 'l0', agent: leads[0].assigned || 'rohit', ai: true, messages: [
      ['system', 'Intro sent from the agent’s WhatsApp', 70], ['customer', 'Saffron me 5th floor pe kya options hain?', 64],
      ['ai', '5th floor par 501-F (3 BHK, East) aur 502-F (3 BHK Corner, North-East) dono available hain. 502-F corner hai isliye thoda premium hai. Aapka budget kitna hai?', 62],
      ['customer', 'Around 1 crore', 55],
    ] },
  ];

  const tickets = [
    { unit: 'saffron:101-F', category: 'seepage', title: 'Seepage on master bathroom wall', description: 'Damp patch is spreading on the wall next to the shower since last week’s rain.', priority: 'normal', status: 'in_progress', assigned: 'ajay', hours_ago: 20,
      comments: [[null, 'Ticket received. Ajay Saini from our maintenance team will contact you within 24 hours.', 20], ['ajay', 'Visited today. External joint near the shaft needs re-grouting; will finish tomorrow.', 4]] },
    { unit: 'saffron:102-F', category: 'electrical', title: 'Kitchen socket not working', description: 'The 16A socket near the fridge stopped working.', priority: 'urgent', status: 'open', assigned: 'sunil', hours_ago: 9, comments: [[null, 'Ticket received. Sunil Kumar will contact you within 6 hours.', 9]] },
    { unit: null, category: 'plumbing', title: 'Low water pressure in guest toilet', description: 'Flush tank takes very long to fill.', priority: 'normal', status: 'resolved', assigned: 'ajay', hours_ago: 80, rating: null, comments: [[null, 'Ticket received.', 80], ['ajay', 'Cleaned the inlet valve. Pressure is normal now.', 60]] },
    { unit: null, category: 'carpentry', title: 'Wardrobe door hinge loose', description: 'Bedroom 2 wardrobe door is sagging.', priority: 'low', status: 'closed', assigned: 'ajay', hours_ago: 300, rating: 5, comments: [[null, 'Ticket received.', 300]] },
  ];

  const shares = [
    { by: 'rohit', project: 'saffron', unit: 'saffron:302-F', lead: 'l1', views: 4 },
    { by: 'b_sharma', project: 'aravali', unit: null, lead: null, views: 11 },
    { by: 'neha', project: 'saffron', unit: 'saffron:502-F', lead: 'l0', views: 2 },
  ];

  return { org, users: [...users, ...customers], projects, units, bookings, leads, visits, chats, tickets, shares, ago, ahead };
}
