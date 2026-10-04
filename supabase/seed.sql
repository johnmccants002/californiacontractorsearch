-- Fictional demonstration data only. No row represents a verified real contractor.
insert into public.classifications (code, name, slug, description, aliases) values
('b', 'General Building Contractor', 'b', 'A General Building contractor works on structures involving at least two unrelated building trades or crafts.', array['general building','general contractor','builder','construction']),
('c10', 'Electrical Contractor', 'c10', 'An Electrical contractor installs, connects, and repairs electrical wires, fixtures, appliances, and related systems.', array['electrical','electrician','electricians']),
('c27', 'Landscaping Contractor', 'c27', 'A Landscaping contractor constructs and maintains landscapes, including planting, irrigation, and related features.', array['landscaping','landscape','landscaper','landscapers']),
('c33', 'Painting and Decorating Contractor', 'c33', 'A Painting and Decorating contractor prepares surfaces and applies paint, coatings, and decorative treatments.', array['painting','painter','painters','decorating']),
('c36', 'Plumbing Contractor', 'c36', 'A Plumbing contractor installs and repairs water, gas, drainage, waste, and vent piping systems.', array['plumbing','plumber','plumbers']),
('c39', 'Roofing Contractor', 'c39', 'A Roofing contractor installs and repairs materials that make structures weatherproof from the top.', array['roofing','roofer','roofers']),
('c46', 'Solar Contractor', 'c46', 'A Solar contractor installs, modifies, maintains, and repairs thermal and photovoltaic solar energy systems.', array['solar','photovoltaic','renewable energy'])
on conflict (code) do update set name = excluded.name, description = excluded.description, aliases = excluded.aliases;

insert into public.licenses (license_number, business_name, license_status, license_type, issue_date, expiration_date, address_line_1, city, state, zip, phone, entity_type, source_updated_at) values
('1056730','ABC Plumbing Inc.','ACTIVE','Contractor','2010-01-15','2027-01-28','120 Demo Avenue','Sacramento','CA','95826','(555) 210-4100','Corporation','2026-09-28'),
('1082401','Golden State Electric Co.','ACTIVE','Contractor','2011-02-15','2028-02-28','157 Demo Avenue','Roseville','CA','95678','(555) 211-4119','Sole Ownership','2026-09-28'),
('1041198','Sierra Crest Builders LLC','ACTIVE','Contractor','2012-03-15','2027-03-28','194 Demo Avenue','Folsom','CA','95630','(555) 212-4138','LLC','2026-09-28'),
('992614','Pacific Ridge Roofing','EXPIRED','Contractor','2013-04-15','2024-06-30','231 Demo Avenue','Los Angeles','CA','90012','(555) 213-4157','Corporation','2026-09-28'),
('1102743','Sunward Solar Works','ACTIVE','Contractor','2014-05-15','2027-05-28','268 Demo Avenue','San Diego','CA','92101','(555) 214-4176','Sole Ownership','2026-09-28'),
('1038820','Valley Oak Landscapes','ACTIVE','Contractor','2015-06-15','2028-06-28','305 Demo Avenue','San Jose','CA','95112','(555) 215-4195','LLC','2026-09-28'),
('987451','Fresno Finish Painting','INACTIVE','Contractor','2016-07-15','2024-06-30','342 Demo Avenue','Fresno','CA','93721','(555) 216-4214','Corporation','2026-09-28'),
('1093327','River City Pipe & Drain','ACTIVE','Contractor','2017-08-15','2028-08-28','379 Demo Avenue','Sacramento','CA','95814','(555) 217-4233','Sole Ownership','2026-09-28'),
('1068259','Placer County Homecraft','ACTIVE','Contractor','2018-09-15','2027-09-28','416 Demo Avenue','Roseville','CA','95747','(555) 218-4252','LLC','2026-09-28'),
('1014762','Folsom Current Electric','ACTIVE','Contractor','2019-01-15','2028-10-28','453 Demo Avenue','Folsom','CA','95630','(555) 219-4271','Corporation','2026-09-28'),
('978305','Angeleno Color Studio','EXPIRED','Contractor','2020-02-15','2024-06-30','490 Demo Avenue','Los Angeles','CA','90026','(555) 220-4290','Sole Ownership','2026-09-28'),
('1110284','Harborview Plumbing Company','ACTIVE','Contractor','2021-03-15','2028-12-28','527 Demo Avenue','San Diego','CA','92109','(555) 221-4309','LLC','2026-09-28'),
('1077451','Silicon Valley Solar Craft','ACTIVE','Contractor','2022-04-15','2027-01-28','564 Demo Avenue','San Jose','CA','95113','(555) 222-4328','Corporation','2026-09-28'),
('1023968','Central Valley Roofline','SUSPENDED','Contractor','2010-05-15','2024-06-30','601 Demo Avenue','Fresno','CA','93710','(555) 223-4347','Sole Ownership','2026-09-28'),
('1098164','Capital City Construction Group','ACTIVE','Contractor','2011-06-15','2027-03-28','638 Demo Avenue','Sacramento','CA','95818','(555) 224-4366','LLC','2026-09-28'),
('1005729','Roseville Garden & Stone','ACTIVE','Contractor','2012-07-15','2028-04-28','675 Demo Avenue','Roseville','CA','95661','(555) 225-4385','Corporation','2026-09-28'),
('1089632','Lake Natoma Builders','ACTIVE','Contractor','2013-08-15','2027-05-28','712 Demo Avenue','Folsom','CA','95630','(555) 226-4404','Sole Ownership','2026-09-28'),
('995140','Metro LA Electrical Services','EXPIRED','Contractor','2014-09-15','2024-06-30','749 Demo Avenue','Los Angeles','CA','90017','(555) 227-4423','LLC','2026-09-28'),
('1106915','Coastal Sun Energy','ACTIVE','Contractor','2015-01-15','2027-07-28','786 Demo Avenue','San Diego','CA','92121','(555) 228-4442','Corporation','2026-09-28'),
('1047306','Orchard City Plumbing','ACTIVE','Contractor','2016-02-15','2028-08-28','823 Demo Avenue','San Jose','CA','95126','(555) 229-4461','Sole Ownership','2026-09-28'),
('1061843','San Joaquin Landscape Studio','ACTIVE','Contractor','2017-03-15','2027-09-28','860 Demo Avenue','Fresno','CA','93704','(555) 230-4480','LLC','2026-09-28'),
('1032947','American River Electric','ACTIVE','Contractor','2018-04-15','2028-10-28','897 Demo Avenue','Sacramento','CA','95819','(555) 231-4499','Corporation','2026-09-28'),
('1084160','Westpark Painting Collective','ACTIVE','Contractor','2019-05-15','2027-11-28','934 Demo Avenue','Roseville','CA','95747','(555) 232-4518','Sole Ownership','2026-09-28'),
('999263','Historic Folsom Roof Works','EXPIRED','Contractor','2020-06-15','2024-06-30','971 Demo Avenue','Folsom','CA','95630','(555) 233-4537','LLC','2026-09-28'),
('1113098','Echo Park Build & Design','ACTIVE','Contractor','2021-07-15','2027-01-28','1008 Demo Avenue','Los Angeles','CA','90026','(555) 234-4556','Corporation','2026-09-28'),
('1071625','Mission Bay Painting','ACTIVE','Contractor','2022-08-15','2028-02-28','1045 Demo Avenue','San Diego','CA','92110','(555) 235-4575','Sole Ownership','2026-09-28'),
('1059041','Evergreen City Landscapes','ACTIVE','Contractor','2010-09-15','2027-03-28','1082 Demo Avenue','San Jose','CA','95118','(555) 236-4594','LLC','2026-09-28'),
('1018394','Tower District Electric','INACTIVE','Contractor','2011-01-15','2024-06-30','1119 Demo Avenue','Fresno','CA','93728','(555) 237-4613','Corporation','2026-09-28'),
('1095478','NorCal Roof & Solar','ACTIVE','Contractor','2012-02-15','2027-05-28','1156 Demo Avenue','Sacramento','CA','95834','(555) 238-4632','Sole Ownership','2026-09-28'),
('1100836','Foothill Plumbing & Heating','ACTIVE','Contractor','2013-03-15','2028-06-28','1193 Demo Avenue','Roseville','CA','95678','(555) 239-4651','LLC','2026-09-28'),
('1065502','Sac Valley General Builders','ACTIVE','Contractor','2014-04-15','2027-07-28','1230 Demo Avenue','Sacramento','CA','95816','(555) 240-4670','Corporation','2026-09-28'),
('1027749','Peninsula Power Systems','ACTIVE','Contractor','2015-05-15','2028-08-28','1267 Demo Avenue','San Jose','CA','95131','(555) 241-4689','Sole Ownership','2026-09-28')
on conflict (license_number) do update set business_name = excluded.business_name, license_status = excluded.license_status, expiration_date = excluded.expiration_date, source_updated_at = excluded.source_updated_at;

-- One primary classification per row, plus selected secondary classifications.
with mapping(license_number, code) as (values
('1056730','c36'),('1082401','c10'),('1041198','b'),('992614','c39'),('1102743','c46'),('1038820','c27'),('987451','c33'),('1093327','c36'),
('1068259','b'),('1014762','c10'),('978305','c33'),('1110284','c36'),('1077451','c46'),('1023968','c39'),('1098164','b'),('1005729','c27'),
('1089632','b'),('995140','c10'),('1106915','c46'),('1047306','c36'),('1061843','c27'),('1032947','c10'),('1084160','c33'),('999263','c39'),
('1113098','b'),('1071625','c33'),('1059041','c27'),('1018394','c10'),('1095478','c39'),('1100836','c36'),('1065502','b'),('1027749','c10'),
('1102743','c10'),('1098164','c33'),('1095478','c46'),('1027749','c46'))
insert into public.license_classifications (license_id, classification_id)
select l.id, c.id from mapping m join public.licenses l using (license_number) join public.classifications c using (code)
on conflict do nothing;

with people(license_number, first_name, middle_name, last_name, full_name, role) as (values
('1056730','John','A','Smith','John A. Smith','Responsible Managing Officer'),
('1082401','Elena',null,'Marquez','Elena Marquez','Sole Owner'),('1041198','Daniel',null,'Kim','Daniel Kim','Responsible Managing Employee'),
('992614','Maya',null,'Thompson','Maya Thompson','Sole Owner'),('1102743','Luis',null,'Hernandez','Luis Hernandez','Responsible Managing Officer'),
('1038820','Priya',null,'Patel','Priya Patel','Sole Owner'),('987451','Marcus',null,'Reed','Marcus Reed','Responsible Managing Employee'),
('1093327','Alicia',null,'Nguyen','Alicia Nguyen','Sole Owner'),('1068259','Robert',null,'Ellis','Robert Ellis','Responsible Managing Officer'),
('1014762','Sofia',null,'Ramirez','Sofia Ramirez','Sole Owner'),('978305','David',null,'Okafor','David Okafor','Sole Owner'),
('1110284','Grace',null,'Lee','Grace Lee','Responsible Managing Employee'),('1077451','Noah',null,'Williams','Noah Williams','Responsible Managing Officer'),
('1023968','Isabel',null,'Torres','Isabel Torres','Sole Owner'),('1098164','Ethan',null,'Brown','Ethan Brown','Responsible Managing Officer'),
('1005729','Chloe',null,'Martin','Chloe Martin','Sole Owner'),('1089632','Andrew',null,'Wilson','Andrew Wilson','Responsible Managing Employee'),
('995140','Natalie',null,'Chen','Natalie Chen','Sole Owner'),('1106915','Mateo',null,'Garcia','Mateo Garcia','Responsible Managing Officer'),
('1047306','Hannah',null,'Johnson','Hannah Johnson','Sole Owner'),('1061843','Owen',null,'Davis','Owen Davis','Responsible Managing Employee'),
('1032947','Camila',null,'Martinez','Camila Martinez','Sole Owner'),('1084160','James',null,'Anderson','James Anderson','Responsible Managing Officer'),
('999263','Fatima',null,'Hassan','Fatima Hassan','Sole Owner'),('1113098','Benjamin',null,'Moore','Benjamin Moore','Responsible Managing Employee'),
('1071625','Zoe',null,'Carter','Zoe Carter','Sole Owner'),('1059041','Samuel',null,'Park','Samuel Park','Responsible Managing Officer'),
('1018394','Lily',null,'Robinson','Lily Robinson','Sole Owner'),('1095478','Jack',null,'Taylor','Jack Taylor','Responsible Managing Employee'),
('1100836','Emma',null,'Clark','Emma Clark','Sole Owner'),('1065502','John',null,'Smith','John Smith','Responsible Managing Officer'),
('1027749','Ava',null,'Lewis','Ava Lewis','Responsible Managing Employee'))
insert into public.personnel (license_id, first_name, middle_name, last_name, full_name, role, association_date)
select l.id, p.first_name, p.middle_name, p.last_name, p.full_name, p.role, '2021-01-01'::date
from people p join public.licenses l using (license_number)
where not exists (select 1 from public.personnel existing where existing.license_id = l.id and existing.full_name = p.full_name);

insert into public.bonds (license_id, bond_type, bond_company, bond_number, bond_amount, effective_date)
select id, 'Contractor''s Bond', 'Pacific Surety Demo Co.', 'DEMO-' || license_number, 25000, '2025-01-01'
from public.licenses where id % 4 <> 0 on conflict do nothing;

insert into public.workers_comp (license_id, carrier, policy_number, effective_date, expiration_date, exemption)
select id,
  case when id % 5 = 0 then null else 'California Trade Insurance Demo' end,
  case when id % 5 = 0 then 'EXEMPT-' || license_number else 'WC-DEMO-' || license_number end,
  case when id % 5 = 0 then null else '2026-01-01'::date end,
  case when id % 5 = 0 then null else '2027-01-01'::date end,
  id % 5 = 0
from public.licenses on conflict do nothing;
