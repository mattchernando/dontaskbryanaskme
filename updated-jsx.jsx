import { useState, useEffect, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const LAT = 38.7253;
const LON = -90.4485;
const ZIP = "63043";

const METEO_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=38.7253&longitude=-90.4485" +
  "&current=temperature_2m,relative_humidity_2m,apparent_temperature" +
  ",wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure" +
  ",precipitation,weather_code,cloud_cover,visibility,dew_point_2m" +
  "&hourly=cape,lifted_index,convective_inhibition" +
  ",wind_speed_10m,wind_direction_10m" +
  ",wind_speed_80m,wind_direction_80m" +
  ",wind_speed_180m,wind_direction_180m" +
  ",precipitation_probability,weather_code,temperature_2m" +
  "&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch" +
  "&timezone=America%2FChicago&forecast_days=1";

const NWS_URL = "https://api.weather.gov/alerts/active?point=38.7253,-90.4485";

// ── Demo data (always shows while real data loads) ───────────────────────────
function makeDemoHours() {
  const now = new Date();
  const times = [];
  for (let i = -2; i < 22; i++) {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + i);
    times.push(d.toISOString());
  }
  const n = times.length;
  return {
    time: times,
    cape: times.map((_, i) => Math.max(0, 400 + i * 55)),
    lifted_index: times.map((_, i) => -0.5 - i * 0.12),
    convective_inhibition: times.map(() => -18),
    wind_speed_10m: times.map(() => 13),
    wind_direction_10m: times.map(() => 215),
    wind_speed_80m: times.map(() => 24),
    wind_direction_80m: times.map(() => 235),
    wind_speed_180m: times.map(() => 32),
    wind_direction_180m: times.map(() => 252),
    precipitation_probability: times.map((_, i) => Math.min(75, i * 4)),
    weather_code: times.map((_, i) => i < 6 ? 2 : i < 14 ? 3 : 95),
    temperature_2m: times.map((_, i) => Math.round(71 - i * 0.4)),
  };
}

const DEMO_WX = {
  temperature_2m: 71, apparent_temperature: 69,
  dew_point_2m: 57, relative_humidity_2m: 61,
  wind_speed_10m: 13, wind_direction_10m: 215,
  wind_gusts_10m: 21, surface_pressure: 1006.2,
  precipitation: 0.00, weather_code: 2,
  cloud_cover: 40, visibility: 16093,
  _isDemo: true,
};
const DEMO_HOURLY = makeDemoHours();

// ── WX icon/label maps ───────────────────────────────────────────────────────
const WX_ICON  = { 0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",51:"🌦",61:"🌧",65:"🌧",80:"🌦",95:"⛈",96:"⛈",99:"⛈" };
const WX_LABEL = { 0:"Clear",1:"Mainly Clear",2:"Partly Cloudy",3:"Overcast",45:"Fog",51:"Lt. Drizzle",61:"Lt. Rain",65:"Heavy Rain",80:"Showers",95:"Thunderstorm",96:"T-Storm/Hail",99:"Severe T-Storm" };

// ── 71 cities within 200 miles of 63043 ─────────────────────────────────────
const CITIES = [
  {name:"Maryland Heights",state:"MO",lat:38.7253,lon:-90.4485,pop:27000,home:true},
  {name:"St. Louis",state:"MO",lat:38.627,lon:-90.197,pop:302000},
  {name:"St. Charles",state:"MO",lat:38.788,lon:-90.496,pop:70000},
  {name:"O'Fallon",state:"MO",lat:38.811,lon:-90.700,pop:91000},
  {name:"Florissant",state:"MO",lat:38.789,lon:-90.322,pop:52000},
  {name:"Chesterfield",state:"MO",lat:38.663,lon:-90.577,pop:47600},
  {name:"Ballwin",state:"MO",lat:38.595,lon:-90.547,pop:30000},
  {name:"Hazelwood",state:"MO",lat:38.771,lon:-90.371,pop:25000},
  {name:"Bridgeton",state:"MO",lat:38.751,lon:-90.428,pop:11500},
  {name:"Creve Coeur",state:"MO",lat:38.669,lon:-90.443,pop:18000},
  {name:"Webster Groves",state:"MO",lat:38.593,lon:-90.356,pop:23000},
  {name:"Clayton",state:"MO",lat:38.644,lon:-90.324,pop:15000},
  {name:"Kirkwood",state:"MO",lat:38.583,lon:-90.406,pop:27000},
  {name:"Fenton",state:"MO",lat:38.513,lon:-90.436,pop:21000},
  {name:"Arnold",state:"MO",lat:38.433,lon:-90.373,pop:20000},
  {name:"Festus",state:"MO",lat:38.218,lon:-90.398,pop:12000},
  {name:"Lambert Intl ✈",state:"MO",lat:38.748,lon:-90.370,pop:0},
  {name:"Columbia",state:"MO",lat:38.951,lon:-92.334,pop:123000},
  {name:"Jefferson City",state:"MO",lat:38.576,lon:-92.174,pop:43000},
  {name:"Rolla",state:"MO",lat:37.951,lon:-91.771,pop:20000},
  {name:"Farmington",state:"MO",lat:37.780,lon:-90.421,pop:17000},
  {name:"Cape Girardeau",state:"MO",lat:37.306,lon:-89.518,pop:40000},
  {name:"Sikeston",state:"MO",lat:36.876,lon:-89.588,pop:16000},
  {name:"Poplar Bluff",state:"MO",lat:36.757,lon:-90.393,pop:17000},
  {name:"Sullivan",state:"MO",lat:38.208,lon:-91.157,pop:7500},
  {name:"Hannibal",state:"MO",lat:39.708,lon:-91.357,pop:17000},
  {name:"Sedalia",state:"MO",lat:38.705,lon:-93.228,pop:21000},
  {name:"East St. Louis",state:"IL",lat:38.624,lon:-90.153,pop:27000},
  {name:"Belleville",state:"IL",lat:38.520,lon:-89.984,pop:41000},
  {name:"Edwardsville",state:"IL",lat:38.811,lon:-89.953,pop:25000},
  {name:"Alton",state:"IL",lat:38.891,lon:-90.184,pop:27000},
  {name:"Collinsville",state:"IL",lat:38.670,lon:-89.985,pop:26000},
  {name:"O'Fallon IL",state:"IL",lat:38.589,lon:-89.912,pop:29000},
  {name:"Granite City",state:"IL",lat:38.702,lon:-90.149,pop:29000},
  {name:"Centralia",state:"IL",lat:38.524,lon:-89.133,pop:13000},
  {name:"Mount Vernon",state:"IL",lat:38.317,lon:-88.903,pop:15000},
  {name:"Carbondale",state:"IL",lat:37.727,lon:-89.216,pop:22000},
  {name:"Marion",state:"IL",lat:37.730,lon:-88.933,pop:17000},
  {name:"Harrisburg",state:"IL",lat:37.738,lon:-88.540,pop:9000},
  {name:"Cairo",state:"IL",lat:37.005,lon:-89.177,pop:2000},
  {name:"Effingham",state:"IL",lat:39.120,lon:-88.543,pop:12500},
  {name:"Mattoon",state:"IL",lat:39.481,lon:-88.372,pop:18000},
  {name:"Decatur",state:"IL",lat:39.840,lon:-88.956,pop:71000},
  {name:"Springfield IL",state:"IL",lat:39.801,lon:-89.644,pop:116000},
  {name:"Jacksonville",state:"IL",lat:39.735,lon:-90.229,pop:18000},
  {name:"Quincy",state:"IL",lat:39.936,lon:-91.410,pop:40000},
  {name:"Champaign",state:"IL",lat:40.117,lon:-88.244,pop:88000},
  {name:"Danville",state:"IL",lat:40.124,lon:-87.630,pop:30000},
  {name:"Bloomington",state:"IL",lat:40.484,lon:-88.994,pop:77000},
  {name:"Peoria",state:"IL",lat:40.694,lon:-89.589,pop:113000},
  {name:"Galesburg",state:"IL",lat:40.948,lon:-90.371,pop:30000},
  {name:"Paducah",state:"KY",lat:37.083,lon:-88.600,pop:27000},
  {name:"Murray",state:"KY",lat:36.610,lon:-88.315,pop:18000},
  {name:"Mayfield",state:"KY",lat:36.741,lon:-88.637,pop:9000},
  {name:"Owensboro",state:"KY",lat:37.774,lon:-87.113,pop:60000},
  {name:"Bowling Green",state:"KY",lat:36.990,lon:-86.444,pop:72000},
  {name:"Clarksville",state:"TN",lat:36.532,lon:-87.359,pop:166000},
  {name:"Nashville",state:"TN",lat:36.162,lon:-86.781,pop:689000},
  {name:"Evansville",state:"IN",lat:37.975,lon:-87.571,pop:117000},
  {name:"Jonesboro",state:"AR",lat:35.842,lon:-90.704,pop:78000},
  {name:"Blytheville",state:"AR",lat:35.927,lon:-89.919,pop:15000},
  {name:"Paragould",state:"AR",lat:36.058,lon:-90.497,pop:27000},
  {name:"Osceola",state:"AR",lat:35.705,lon:-89.969,pop:7500},
  {name:"Keokuk",state:"IA",lat:40.398,lon:-91.385,pop:10000},
  {name:"Burlington",state:"IA",lat:40.808,lon:-91.112,pop:25000},
];

// ── Vector math ──────────────────────────────────────────────────────────────
const r = d => (d * Math.PI) / 180;
const windVec = (s, d) => ({ u: -s * Math.sin(r(d)), v: -s * Math.cos(r(d)) });
const mag = (u, v) => Math.sqrt(u * u + v * v);
const vDir = (u, v) => { let d = Math.atan2(-u, -v) * (180 / Math.PI); return d < 0 ? d + 360 : d; };
const compass = d => { if (d == null) return "--"; return ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d / 22.5) % 16]; };

// ── Responsive hook ──────────────────────────────────────────────────────────
function useWidth() {
  const [w, setW] = useState(800);
  useEffect(() => {
    setW(window.innerWidth);
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ── Find current hour index (no findLastIndex) ───────────────────────────────
function findCurrentHourIdx(times) {
  const now = new Date();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]) <= now) idx = i;
    else break;
  }
  return idx;
}

// ── AI Analysis ──────────────────────────────────────────────────────────────
function analyze(cur, hrly, idx, alertFeatures) {
  if (!cur || !hrly || !hrly.time) return null;
  const i = idx;
  const cape = Math.max(0, hrly.cape?.[i] ?? 0);
  const li   = hrly.lifted_index?.[i] ?? 0;
  const cin  = hrly.convective_inhibition?.[i] ?? 0;
  const ws10 = hrly.wind_speed_10m?.[i]  ?? cur.wind_speed_10m  ?? 0;
  const wd10 = hrly.wind_direction_10m?.[i] ?? cur.wind_direction_10m ?? 0;
  const ws80 = hrly.wind_speed_80m?.[i]  ?? 0;
  const wd80 = hrly.wind_direction_80m?.[i] ?? 0;
  const ws180 = hrly.wind_speed_180m?.[i] ?? 0;
  const wd180 = hrly.wind_direction_180m?.[i] ?? 0;
  const sfc = windVec(ws10, wd10);
  const llj = windVec(ws80, wd80);
  const mid = windVec(ws180, wd180);
  const llShear = mag(llj.u - sfc.u, llj.v - sfc.v);
  const dlShear = mag(mid.u - sfc.u, mid.v - sfc.v);
  const dd = Math.abs(wd80 - wd10);
  const turn = dd > 180 ? 360 - dd : dd;
  const cyclonic = (wd80 - wd10 + 360) % 360 < 180;
  const srh = llShear * llShear * Math.sin(r(Math.min(turn, 90))) * 2.8 * (cyclonic ? 1 : 0.5);
  const stp = Math.min(cape/1500,2) * Math.max(-li/5,0) * Math.min(dlShear/35,1.5) * (1 + Math.max((srh-25)/100,0)*0.5) * (cin < -100 ? 0.5 : cin < -50 ? 0.7 : 1);
  const hasTW  = alertFeatures.some(f => (f.properties?.event || "").toLowerCase().includes("tornado warning"));
  const hasTWa = alertFeatures.some(f => (f.properties?.event || "").toLowerCase().includes("tornado watch"));
  const hasSW  = alertFeatures.some(f => (f.properties?.event || "").toLowerCase().includes("severe thunderstorm"));
  const su = hasTW ? Math.max(stp, 4) : hasTWa ? Math.max(stp, 2) : stp;
  let ef = cape>4000&&dlShear>60?"EF4-5":cape>3000&&dlShear>50?"EF3+":cape>2000&&dlShear>40?"EF2-3":cape>1200&&dlShear>30?"EF1-2":"EF0-1";
  let lv,col,bg,act,prob;
  if      (su>=3.5){lv="EXTREME"; col="#ff2200";bg="rgba(255,34,0,0.18)"; act="SEEK SHELTER NOW";     prob=Math.min(90,55+su*5);}
  else if (su>=1.5){lv="HIGH";    col="#ff7700";bg="rgba(255,119,0,0.13)";act="PREPARE TO SHELTER";   prob=Math.min(55,25+su*8);}
  else if (su>=0.8){lv="MODERATE";col="#ffcc00";bg="rgba(255,204,0,0.10)";act="REMAIN ALERT";         prob=Math.min(25,8+su*10);}
  else if (su>=0.3){lv="ELEVATED";col="#ffff33";bg="rgba(220,220,0,0.08)";act="MONITOR CONDITIONS";   prob=Math.round(su*15);}
  else             {lv="LOW";     col="#00dd66";bg="rgba(0,210,90,0.08)"; act="NO IMMEDIATE THREAT";  prob=Math.round(Math.max(0,su*5));}
  const mn_u=(sfc.u+mid.u)/2, mn_v=(sfc.v+mid.v)/2, mm=mag(mn_u,mn_v)||1;
  const rm_u=mn_u+(mn_v/mm)*8, rm_v=mn_v-(mn_u/mm)*8;
  const stSpd=Math.max(5,Math.round(mag(rm_u,rm_v)));
  const stDir=Math.round((vDir(rm_u,rm_v)+180)%360);
  let note;
  if(hasTW)  note="⚠️ TORNADO WARNING ACTIVE. Take cover in lowest floor of sturdy building NOW.";
  else if(hasTWa) note="🔶 TORNADO WATCH. Conditions favorable. CAPE "+Math.round(cape)+" J/kg, shear "+Math.round(dlShear)+" mph. Be ready.";
  else if(lv==="EXTREME") note="Dangerous setup. CAPE "+Math.round(cape)+" J/kg, "+Math.round(dlShear)+" mph shear, SRH ~"+Math.round(srh)+". "+ef+" potential. Motion "+compass(stDir)+" @ "+stSpd+" mph.";
  else if(lv==="HIGH")    note="High risk. CAPE "+Math.round(cape)+" J/kg, LI "+li.toFixed(1)+", "+Math.round(dlShear)+" mph shear. LL shear "+Math.round(llShear)+" mph supports supercell. Motion "+compass(stDir)+" @ "+stSpd+" mph.";
  else if(lv==="MODERATE")note="Moderate risk. CAPE "+Math.round(cape)+" J/kg, "+Math.round(dlShear)+" mph shear. Marginal tornado ingredients. Monitor NWS.";
  else if(lv==="ELEVATED")note="Elevated but sub-severe. CAPE "+Math.round(cape)+" J/kg, shear "+Math.round(dlShear)+" mph. CIN "+Math.round(cin)+" limiting storms. Stay weather-aware.";
  else note="Benign conditions. CAPE "+Math.round(cape)+" J/kg, "+Math.round(dlShear)+" mph shear. No organized convection expected.";
  return {cape,li,cin,stp:su,llShear,dlShear,srh,ef,lv,col,bg,act,prob:Math.round(prob),note,stSpd,stDir,hasTW,hasTWa,hasSW,ws10,wd10,ws80,wd80,ws180,wd180,cyclonic};
}

// ── Cities in path ───────────────────────────────────────────────────────────
function citiesInPath(a) {
  if (!a || a.stSpd < 1) return [];
  const sr = r(a.stDir);
  const dx = Math.sin(sr), dy = Math.cos(sr);
  return CITIES.filter(c => !c.home).reduce(function(acc, c) {
    const dLat=(c.lat-LAT)*69, dLon=(c.lon-LON)*53.5;
    const dist=Math.sqrt(dLat*dLat+dLon*dLon);
    if(dist>200) return acc;
    const along=dLat*dy+dLon*dx;
    if(along<0) return acc;
    const cross=Math.abs(dLat*dx-dLon*dy);
    const hw=6+(along/200)*22;
    if(cross>hw) return acc;
    const pct=1-(cross/hw);
    const risk=pct>0.7?"DIRECT":pct>0.35?"HIGH":"POSSIBLE";
    const hrs=along/a.stSpd;
    acc.push({...c,dist:Math.round(dist),along:Math.round(along),cross:Math.round(cross),hrs,mins:Math.round(hrs*60),risk,pct});
    return acc;
  },[]).sort(function(a,b){return a.along-b.along;});
}

// ── SVG Map ──────────────────────────────────────────────────────────────────
function RadarMap({a, cities}) {
  const col=a.col, PL=230, PO=185;
  const toX=lon=>(lon-LON)*PO, toY=lat=>-(lat-LAT)*PL;
  const sr=r(a.stDir);
  const dLat=(Math.cos(sr)*a.stSpd)/69, dLon=(Math.sin(sr)*a.stSpd)/55;
  const pts=[];
  for(let i=0;i<=28;i++){const t=(i/28)*4;const cLa=LAT+dLat*t;const cLo=LON+dLon*t;const hw=0.022+t*0.048;const pLa=-dLon*hw/(a.stSpd/69||0.001);const pLo=dLat*hw/(a.stSpd/55||0.001);pts.push(toX(cLo-pLo).toFixed(1)+","+toY(cLa-pLa).toFixed(1));}
  for(let i=28;i>=0;i--){const t=(i/28)*4;const cLa=LAT+dLat*t;const cLo=LON+dLon*t;const hw=0.022+t*0.048;const pLa=-dLon*hw/(a.stSpd/69||0.001);const pLo=dLat*hw/(a.stSpd/55||0.001);pts.push(toX(cLo+pLo).toFixed(1)+","+toY(cLa+pLa).toFixed(1));}
  const inPathSet=new Set(cities.map(c=>c.name+c.state));
  const mapCities=CITIES.filter(c=>{const d=Math.sqrt(((c.lat-LAT)*69)**2+((c.lon-LON)*53.5)**2);return d<198;});
  return (
    <svg viewBox="-200 -170 400 340" style={{width:"100%",height:"100%",background:"#03060e"}}>
      <defs>
        <marker id="arw" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill={col}/></marker>
        <radialGradient id="hg" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#00ff88" stopOpacity="0.3"/><stop offset="100%" stopColor="#00ff88" stopOpacity="0"/></radialGradient>
      </defs>
      {[-1.5,-1,-0.5,0,0.5,1,1.5].map(d=>(
        <g key={d} opacity="0.2">
          <line x1={toX(LON+d)} y1="-175" x2={toX(LON+d)} y2="175" stroke="#102030" strokeWidth="0.5"/>
          <line x1="-205" y1={toY(LAT+d)} x2="205" y2={toY(LAT+d)} stroke="#102030" strokeWidth="0.5"/>
        </g>
      ))}
      {/* Mississippi River rough trace */}
      <polyline points={`${toX(-89.95)},-170 ${toX(-89.85)},-110 ${toX(-89.45)},-40 ${toX(-89.15)},60 ${toX(-89.05)},130 ${toX(-88.95)},170`}
        stroke="#1a3a5a" strokeWidth="1.5" fill="none" strokeDasharray="5,3"/>
      {[50,100,150,200].map(ri=>{
        const rla=ri/69,rlo=ri/53.5;
        return <ellipse key={ri} cx={toX(LON)} cy={toY(LAT)} rx={rlo*PO} ry={rla*PL} fill="none" stroke="#0d2035" strokeWidth="0.6"/>;
      })}
      <text x={toX(LON)} y={toY(LAT)-(50/69)*PL-3} fill="#0d2540" fontSize="5" textAnchor="middle" fontFamily="monospace">50mi</text>
      <text x={toX(LON)} y={toY(LAT)-(100/69)*PL-3} fill="#0d2540" fontSize="5" textAnchor="middle" fontFamily="monospace">100mi</text>
      <text x={toX(LON)} y={toY(LAT)-(150/69)*PL-3} fill="#0d2540" fontSize="5" textAnchor="middle" fontFamily="monospace">150mi</text>
      <polygon points={pts.join(" ")} fill={col+"28"} stroke={col} strokeWidth="1" strokeDasharray="4,2"/>
      {[1,2,3,4].map(h=>{
        const cLa=LAT+dLat*h, cLo=LON+dLon*h;
        return (<g key={h}>
          <line x1={toX(LON+dLon*(h-1))} y1={toY(LAT+dLat*(h-1))} x2={toX(cLo)} y2={toY(cLa)}
            stroke={col} strokeWidth="1.5" strokeDasharray="6,3" markerEnd={h===4?"url(#arw)":undefined}/>
          <circle cx={toX(cLo)} cy={toY(cLa)} r="3" fill="#040810" stroke={col} strokeWidth="1"/>
          <text x={toX(cLo)+4} y={toY(cLa)+3} fill={col} fontSize="5" fontFamily="monospace">+{h}H</text>
        </g>);
      })}
      {mapCities.map(c=>{
        const ip=inPathSet.has(c.name+c.state);
        const ic=cities.find(x=>x.name===c.name&&x.state===c.state);
        const dc=c.home?"#00ff88":ip?(ic?.risk==="DIRECT"?"#ff4422":ic?.risk==="HIGH"?"#ff8844":"#ffcc44"):"#1a4060";
        return (
          <g key={c.name+c.state}>
            {c.home&&<circle cx={toX(c.lon)} cy={toY(c.lat)} r="12" fill="url(#hg)"/>}
            <circle cx={toX(c.lon)} cy={toY(c.lat)} r={c.home?5:ip?3.5:2} fill={dc} opacity={ip||c.home?1:0.45}/>
            {(c.home||ip||c.pop>50000)&&(
              <text x={toX(c.lon)+6} y={toY(c.lat)+3} fill={dc} fontSize={c.home?6:5}
                fontFamily="monospace" fontWeight={c.home||ip?"bold":"normal"} opacity={c.home||ip?1:0.55}>
                {c.name}
              </text>
            )}
          </g>
        );
      })}
      <text x="-195" y="-158" fill="#0d2a40" fontSize="5.5" fontFamily="monospace">200-MI SECTOR • AI TRACK PROJECTION</text>
      <text x="-195" y="-148" fill={col} fontSize="5.5" fontFamily="monospace">MOTION: {compass(a.stDir)} @ {a.stSpd} MPH</text>
      <text x="-195" y="-138" fill="#0d2040" fontSize="5" fontFamily="monospace">MO</text>
      <text x={toX(-88.5)} y="-158" fill="#0d2040" fontSize="5" fontFamily="monospace">IL</text>
    </svg>
  );
}

// ── Small components ─────────────────────────────────────────────────────────
const S = { bg:"#0a1120", border:"#152038", text:"#c8d8f0", dim:"#2a4060" };

function Tile({label,val,unit,sub,col="#c8d8f0"}) {
  return (
    <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:7,padding:"10px 12px"}}>
      <div style={{color:S.dim,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:3}}>{label}</div>
      <div style={{color:col,fontFamily:"monospace",fontSize:20,fontWeight:"bold",lineHeight:1}}>
        {val}<span style={{fontSize:11,marginLeft:2,opacity:0.7}}>{unit}</span>
      </div>
      {sub&&<div style={{color:S.dim,fontFamily:"monospace",fontSize:9,marginTop:3}}>{sub}</div>}
    </div>
  );
}

function Bar({label,val,max,unit,col,warn,danger}) {
  const pct=Math.min(100,(val/max)*100);
  const c=val>=danger?"#ff4400":val>=warn?"#ffcc00":col||"#00aaff";
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{color:S.dim,fontFamily:"monospace",fontSize:10}}>{label}</span>
        <span style={{color:c,fontFamily:"monospace",fontSize:10,fontWeight:"bold"}}>{typeof val==="number"?val%1===0?val:val.toFixed(1):"--"} {unit}</span>
      </div>
      <div style={{height:5,background:"#0d1828",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:pct+"%",height:"100%",background:c,borderRadius:3,boxShadow:`0 0 5px ${c}80`}}/>
      </div>
    </div>
  );
}

function StatusDot({ok,label}) {
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontFamily:"monospace",fontSize:9,color:ok?"#00aa44":"#aa3300"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:ok?"#00dd55":"#dd4400",display:"inline-block"}}/>
      {label}
    </span>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [wx,   setWx]     = useState(DEMO_WX);
  const [hrly, setHrly]   = useState(DEMO_HOURLY);
  const [aAlerts, setAlerts] = useState([]);
  const [apiOk,  setApiOk]  = useState({meteo:null, nws:null});
  const [updated, setUpd]   = useState(null);
  const [loading, setLoad]  = useState(false);
  const [tab, setTab]       = useState("analysis");
  const width = useWidth();
  const isMob = width < 680;
  const isSm  = width < 440;

  // Compute analysis from current state
  const hIdx   = hrly ? findCurrentHourIdx(hrly.time || []) : 0;
  const a      = analyze(wx, hrly, hIdx, aAlerts);
  const impact = a ? citiesInPath(a) : [];
  const col    = a ? a.col : "#00dd66";

  const fetchAll = useCallback(async () => {
    setLoad(true);
    let meteoOk = false, nwsOk = false;

    // Open-Meteo
    try {
      const res  = await fetch(METEO_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data && data.current && data.hourly) {
        setWx(data.current);
        setHrly(data.hourly);
        meteoOk = true;
      }
    } catch(e) {
      console.warn("Open-Meteo failed:", e.message);
    }

    // NWS Alerts
    try {
      const res  = await fetch(NWS_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setAlerts(data.features || []);
      nwsOk = true;
    } catch(e) {
      console.warn("NWS failed:", e.message);
    }

    setApiOk({ meteo: meteoOk, nws: nwsOk });
    setUpd(new Date());
    setLoad(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const isDemo = wx && wx._isDemo;

  const TABS = [
    {id:"analysis", label:"🌪 Analysis"},
    {id:"map",      label:"🗺 Map"},
    {id:"cities",   label:"🏙 Cities (" + impact.length + ")"},
    {id:"alerts",   label:"⚠️ Alerts (" + aAlerts.length + ")"},
  ];

  return (
    <div style={{background:"#060c1a",minHeight:"100vh",color:S.text,fontFamily:"system-ui,sans-serif",padding:isMob?"8px":"14px",maxWidth:1280,margin:"0 auto"}}>

      {/* HEADER */}
      <div style={{background:a&&a.hasTW?"linear-gradient(135deg,#2a0000,#1a0505)":"linear-gradient(135deg,#08102a,#060c1a)",
        border:`1px solid ${a&&a.hasTW?"#ff220060":"#1a3060"}`,borderRadius:9,
        padding:isMob?"10px 12px":"14px 18px",marginBottom:8,
        display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontFamily:"monospace",fontSize:isMob?15:19,fontWeight:"bold",
            color:a&&a.hasTW?"#ff4422":"#00ff88",letterSpacing:1,
            textShadow:`0 0 16px ${a&&a.hasTW?"#ff2200":"#00ff88"}50`}}>
            🌪 DON'T ASK BRYAN — ASK ME
          </div>
          <div style={{color:"#1a4060",fontFamily:"monospace",fontSize:isMob?8:9,marginTop:2}}>
            AI METEOROLOGIST • ZIP {ZIP} — MARYLAND HEIGHTS, MO • ST. LOUIS COUNTY
          </div>
          <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
            <StatusDot ok={apiOk.meteo} label={apiOk.meteo===null?"METEO: LOADING…":apiOk.meteo?"METEO: LIVE":"METEO: DEMO"}/>
            <StatusDot ok={apiOk.nws}   label={apiOk.nws===null?"NWS: LOADING…":apiOk.nws?"NWS: LIVE":"NWS: UNAVAILABLE"}/>
            {isDemo&&<span style={{color:"#886600",fontFamily:"monospace",fontSize:9}}>⚑ DEMO DATA — real data loading</span>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {updated&&<span style={{color:"#0d2535",fontFamily:"monospace",fontSize:9}}>{updated.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</span>}
          <button onClick={fetchAll} disabled={loading}
            style={{background:"#0a1830",border:"1px solid #1a3a6a",color:loading?"#1a3a6a":"#2a7acc",
              borderRadius:5,padding:"6px 14px",fontFamily:"monospace",fontSize:11,cursor:loading?"wait":"pointer",minHeight:34}}>
            {loading?"…":"↻ REFRESH"}
          </button>
        </div>
      </div>

      {/* THREAT BANNER */}
      {a && (
        <div style={{background:`linear-gradient(90deg,${a.bg},#060c1a)`,border:`2px solid ${col}50`,
          borderRadius:8,padding:isMob?"10px 12px":"12px 16px",marginBottom:8,
          boxShadow:`0 0 16px ${col}20`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div>
                <div style={{color:"#1a4060",fontFamily:"monospace",fontSize:9,letterSpacing:1}}>AI TORNADO THREAT</div>
                <div style={{color:col,fontFamily:"monospace",fontSize:isMob?22:28,fontWeight:"bold",
                  letterSpacing:2,textShadow:`0 0 16px ${col}60`,lineHeight:1.1}}>
                  {a.lv}
                </div>
                <div style={{color:col,fontFamily:"monospace",fontSize:10,opacity:0.8}}>{a.act}</div>
              </div>
              <div style={{borderLeft:`1px solid ${col}30`,paddingLeft:12}}>
                <div style={{color:"#1a4060",fontFamily:"monospace",fontSize:9}}>TORNADO PROB</div>
                <div style={{color:col,fontFamily:"monospace",fontSize:20,fontWeight:"bold"}}>{a.prob}<span style={{fontSize:11}}>%</span></div>
                <div style={{color:"#1a4060",fontFamily:"monospace",fontSize:9}}>STP {a.stp.toFixed(2)}</div>
              </div>
            </div>
            {!isMob&&(
              <div style={{background:"#060c18",border:`1px solid ${col}30`,borderRadius:6,padding:"9px 12px",maxWidth:460,flex:1}}>
                <div style={{color:"#1a4060",fontFamily:"monospace",fontSize:9,marginBottom:4}}>AI ASSESSMENT</div>
                <div style={{color:"#7a9ab0",fontFamily:"monospace",fontSize:10,lineHeight:1.6}}>{a.note}</div>
              </div>
            )}
          </div>
          {isMob&&<div style={{marginTop:9,color:"#5a7a90",fontFamily:"monospace",fontSize:10,lineHeight:1.6}}>{a.note}</div>}
        </div>
      )}

      {/* CURRENT CONDITIONS — always visible */}
      <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:8,padding:isMob?"9px 11px":"11px 14px",marginBottom:8}}>
        <div style={{color:"#1a3a5a",fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:8}}>
          CURRENT CONDITIONS — {ZIP} {WX_LABEL[wx.weather_code]||""} {WX_ICON[wx.weather_code]||""}
          {isDemo&&<span style={{color:"#665500",marginLeft:6}}>(demo)</span>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isSm?"1fr 1fr":"repeat(3,1fr)",gap:7}}>
          <Tile label="TEMPERATURE" val={wx.temperature_2m!=null?Math.round(wx.temperature_2m):"--"} unit="°F" sub={"Feels "+Math.round(wx.apparent_temperature||0)+"°F"} col="#ff9944"/>
          <Tile label="DEW POINT"   val={wx.dew_point_2m!=null?Math.round(wx.dew_point_2m):"--"} unit="°F" sub={"RH "+(wx.relative_humidity_2m??"--")+"%"} col="#44bbff"/>
          <Tile label="WIND"        val={wx.wind_speed_10m!=null?Math.round(wx.wind_speed_10m):"--"} unit="mph"
            sub={"G "+(wx.wind_gusts_10m!=null?Math.round(wx.wind_gusts_10m):"--")+" · "+compass(wx.wind_direction_10m)} col="#88ddff"/>
          <Tile label="PRESSURE"    val={wx.surface_pressure!=null?(wx.surface_pressure/33.8639).toFixed(2):"--"} unit="inHg"
            sub={wx.surface_pressure<990?"⬇ FALLING":"Steady"} col={wx.surface_pressure<990?"#ff8844":"#aabbcc"}/>
          <Tile label="PRECIP"      val={wx.precipitation!=null?wx.precipitation.toFixed(2):"--"} unit="in" sub="1-hr" col="#44aaff"/>
          <Tile label="CLOUD COVER" val={wx.cloud_cover!=null?wx.cloud_cover:"--"} unit="%"
            sub={wx.visibility!=null?"Vis "+(wx.visibility/1609).toFixed(1)+" mi":""} col="#6688aa"/>
        </div>
      </div>

      {/* MOBILE TABS */}
      {isMob&&(
        <div style={{display:"flex",background:S.bg,border:`1px solid ${S.border}`,borderRadius:"7px 7px 0 0",overflow:"hidden",borderBottom:"none"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"9px 2px",
              fontFamily:"monospace",fontSize:isSm?8:9,
              background:tab===t.id?"#0d1e38":"transparent",
              color:tab===t.id?"#4499cc":"#2a4060",border:"none",
              borderBottom:tab===t.id?"2px solid #4499cc":"2px solid transparent",
              cursor:"pointer",whiteSpace:"nowrap"}}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* DESKTOP 2-col grid */}
      {!isMob ? (
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <AnalPanel a={a}/>
            <MapPanel  a={a} impact={impact} col={col}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <CitiesPanel impact={impact} a={a}/>
            <AlertsPanel alerts={aAlerts} loading={loading}/>
          </div>
          <HourlyPanel hrly={hrly} hIdx={hIdx}/>
        </>
      ) : (
        <div style={{background:S.bg,border:`1px solid ${S.border}`,borderTop:"none",borderRadius:"0 0 8px 8px",marginBottom:8}}>
          {tab==="analysis"&&<AnalPanel    a={a} mob/>}
          {tab==="map"     &&<MapPanel     a={a} impact={impact} col={col} mob/>}
          {tab==="cities"  &&<CitiesPanel  impact={impact} a={a} mob/>}
          {tab==="alerts"  &&<AlertsPanel  alerts={aAlerts} loading={loading} mob/>}
        </div>
      )}
      {isMob&&<HourlyPanel hrly={hrly} hIdx={hIdx} mob/>}

      <div style={{color:"#0d1e2e",fontFamily:"monospace",fontSize:8,textAlign:"center",marginTop:6,lineHeight:1.6}}>
        DATA: Open-Meteo (ECMWF/GFS) + NOAA NWS · METHODS: CAPE · LI · CIN · Bulk Wind Shear · SRH · STP · Bunkers RM
        <br/>For educational use · Always follow official NWS warnings in emergencies
      </div>
    </div>
  );
}

// ── Panel components ──────────────────────────────────────────────────────────
function AnalPanel({a, mob}) {
  return (
    <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:mob?0:8,padding:mob?"11px":"12px 14px"}}>
      {!mob&&<div style={{color:"#1a3a5a",fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:10}}>AI TORNADO ANALYSIS — SENIOR METEOROLOGIST METHODS</div>}
      <Bar label="CAPE (Convective Energy)"       val={a?.cape??0}     max={5000} unit="J/kg"   warn={1000} danger={2500}/>
      <Bar label="Lifted Index (negative)"        val={a?Math.max(0,-a.li):0} max={12} unit="neg" warn={3} danger={6}/>
      <Bar label="Low-Level Wind Shear (0–1km)"   val={a?.llShear??0}  max={60}   unit="mph"    warn={20}   danger={35}   col="#44bbff"/>
      <Bar label="Deep-Layer Shear (0–3km)"       val={a?.dlShear??0}  max={80}   unit="mph"    warn={30}   danger={50}   col="#6699ff"/>
      <Bar label="SRH Proxy (Storm-Rel. Helicity)"val={a?.srh??0}      max={600}  unit="m²/s²"  warn={100}  danger={250}  col="#aa44ff"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:10}}>
        {[
          {lbl:"CIN",         val:a?.cin!=null?Math.round(a.cin):"--",  unit:"J/kg", col:a?.cin<-50?"#ff7744":"#6688aa", note:a?.cin<-100?"STRONG CAP":a?.cin<-25?"MOD CAP":"WEAK CAP"},
          {lbl:"EF POTENTIAL",val:a?.ef||"--",                          unit:"",     col:a?.ef?.includes("3")||a?.ef?.includes("4")?"#ff4422":a?.ef?.includes("2")?"#ff9900":"#6688aa",note:"IF TORNADO"},
          {lbl:"STORM MOTION",val:a?compass(a.stDir):"--",              unit:"",     col:"#44bbff",note:a?a.stSpd+"mph Bunkers RM":""},
        ].map(m=>(
          <div key={m.lbl} style={{background:"#070e1c",border:`1px solid ${S.border}`,borderRadius:6,padding:"8px 9px"}}>
            <div style={{color:"#1a3050",fontFamily:"monospace",fontSize:8,marginBottom:2}}>{m.lbl}</div>
            <div style={{color:m.col,fontFamily:"monospace",fontSize:14,fontWeight:"bold"}}>{m.val}<span style={{fontSize:9}}>{m.unit}</span></div>
            <div style={{color:"#1a3050",fontFamily:"monospace",fontSize:8,marginTop:2}}>{m.note}</div>
          </div>
        ))}
      </div>
      {a&&(
        <div style={{marginTop:10,background:"#070e1c",border:`1px solid ${S.border}`,borderRadius:6,padding:"9px 10px"}}>
          <div style={{color:"#1a3050",fontFamily:"monospace",fontSize:8,marginBottom:5,letterSpacing:1}}>WIND PROFILE (VERTICAL SOUNDING)</div>
          {[{lbl:"SURFACE (10m)",s:a.ws10,d:a.wd10},{lbl:"LLJ (80m)",s:a.ws80,d:a.wd80},{lbl:"MID-LVL (180m)",s:a.ws180,d:a.wd180}].map(w=>(
            <div key={w.lbl} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{color:"#1a3a5a",fontFamily:"monospace",fontSize:9}}>{w.lbl}</span>
              <span style={{color:"#3a6a88",fontFamily:"monospace",fontSize:9}}>{Math.round(w.s)} mph {compass(w.d)} ({Math.round(w.d)}°)</span>
            </div>
          ))}
          <div style={{color:a.cyclonic?"#00cc55":"#ff7744",fontFamily:"monospace",fontSize:9,marginTop:5,paddingTop:5,borderTop:`1px solid ${S.border}`}}>
            {a.cyclonic?"✓ CYCLONIC TURNING — supports low-level rotation":"↺ NON-CYCLONIC — reduced tornado potential"}
          </div>
        </div>
      )}
    </div>
  );
}

function MapPanel({a, impact, col, mob}) {
  if (!a) return <div style={{background:"#03060e",border:`1px solid ${S.border}`,borderRadius:mob?0:8,display:"flex",alignItems:"center",justifyContent:"center",minHeight:280}}><span style={{color:"#1a3050",fontFamily:"monospace",fontSize:11}}>LOADING…</span></div>;
  return (
    <div style={{background:"#03060e",border:`1px solid ${a.hasTW?"#ff220050":S.border}`,borderRadius:mob?0:8,overflow:"hidden",position:"relative",minHeight:mob?280:360}}>
      <RadarMap a={a} cities={impact}/>
      <div style={{position:"absolute",bottom:6,left:8,right:8,background:"rgba(3,6,14,0.9)",borderRadius:5,padding:"5px 8px",border:`1px solid #0a1a28`}}>
        <div style={{color:"#0a1e30",fontFamily:"monospace",fontSize:8}}>
          Bunkers RM storm motion · 4-hr projection · Cone = uncertainty zone · 🔴 Direct  🟠 High  🟡 Possible
        </div>
      </div>
    </div>
  );
}

function CitiesPanel({impact, a, mob}) {
  const dir=impact.filter(c=>c.risk==="DIRECT");
  const hi=impact.filter(c=>c.risk==="HIGH");
  const po=impact.filter(c=>c.risk==="POSSIBLE");
  return (
    <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:mob?0:8,overflow:"hidden"}}>
      <div style={{padding:"10px 12px 7px",borderBottom:`1px solid #0d1828`}}>
        <div style={{color:"#1a3a5a",fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:3}}>PROJECTED IMPACT CITIES — 200 MI RADIUS</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <span style={{color:"#ff4422",fontFamily:"monospace",fontSize:10}}>🔴 {dir.length} DIRECT</span>
          <span style={{color:"#ff8844",fontFamily:"monospace",fontSize:10}}>🟠 {hi.length} HIGH</span>
          <span style={{color:"#ffcc44",fontFamily:"monospace",fontSize:10}}>🟡 {po.length} POSSIBLE</span>
        </div>
      </div>
      <div style={{maxHeight:mob?300:340,overflowY:"auto"}}>
        {impact.length===0?(
          <div style={{padding:"18px 14px",textAlign:"center"}}>
            <div style={{color:"#00cc55",fontFamily:"monospace",fontSize:13,marginBottom:5}}>✓ PATH CLEAR</div>
            <div style={{color:"#0d2a20",fontFamily:"monospace",fontSize:10}}>
              {a?`No cities in ${compass(a.stDir)}-moving storm path at ${a.stSpd} mph.`:"Awaiting data…"}
            </div>
          </div>
        ):impact.map((c,i)=>{
          const rc=c.risk==="DIRECT"?"#ff4422":c.risk==="HIGH"?"#ff8844":"#ffcc44";
          const ico=c.risk==="DIRECT"?"🔴":c.risk==="HIGH"?"🟠":"🟡";
          const tStr=c.hrs<1?c.mins+"min":Math.floor(c.hrs)+"h "+Math.round((c.hrs%1)*60)+"m";
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
              borderBottom:`1px solid #0d1828`,background:c.risk==="DIRECT"?"#110802":"transparent"}}>
              <span style={{fontSize:12}}>{ico}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:S.text,fontFamily:"monospace",fontSize:11,fontWeight:"bold",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {c.name}, {c.state}
                  {c.pop>0&&<span style={{color:"#1a3050",fontSize:9,marginLeft:4}}>{(c.pop/1000).toFixed(0)}k</span>}
                </div>
                <div style={{color:S.dim,fontFamily:"monospace",fontSize:9}}>{c.dist}mi · {c.cross}mi off track</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:rc,fontFamily:"monospace",fontSize:10,fontWeight:"bold"}}>{c.risk}</div>
                <div style={{color:"#1a4050",fontFamily:"monospace",fontSize:9}}>~{tStr}</div>
              </div>
            </div>
          );
        })}
      </div>
      {a&&<div style={{padding:"6px 11px",borderTop:`1px solid #0d1828`,color:"#0d2030",fontFamily:"monospace",fontSize:8}}>
        Storm: {compass(a.stDir)} @ {a.stSpd} mph · Updates every 5 min
      </div>}
    </div>
  );
}

function AlertsPanel({alerts, loading, mob}) {
  return (
    <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:mob?0:8,padding:"11px 12px"}}>
      {!mob&&<div style={{color:"#1a3a5a",fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:9,display:"flex",justifyContent:"space-between"}}>
        <span>NWS ACTIVE ALERTS — ST. LOUIS COUNTY</span>
        {alerts.length>0&&<span style={{color:"#ff7700",fontWeight:"bold"}}>{alerts.length} ACTIVE</span>}
      </div>}
      <div style={{maxHeight:mob?320:340,overflowY:"auto"}}>
        {loading?(
          <div style={{color:"#1a3050",fontFamily:"monospace",fontSize:10,padding:20,textAlign:"center"}}>FETCHING NWS…</div>
        ):alerts.length===0?(
          <div style={{background:"#05100a",border:"1px solid #0d2a1a",borderRadius:7,padding:"14px",textAlign:"center"}}>
            <div style={{color:"#00dd66",fontFamily:"monospace",fontSize:13,marginBottom:5}}>✓ ALL CLEAR</div>
            <div style={{color:"#0d2a18",fontFamily:"monospace",fontSize:10}}>No active NWS alerts for St. Louis County.</div>
          </div>
        ):alerts.map((al,i)=>{
          const p=al.properties;
          const isTW=p.event?.toLowerCase().includes("tornado warning");
          const isTWa=p.event?.toLowerCase().includes("tornado watch");
          const isST=p.event?.toLowerCase().includes("severe");
          const c=isTW?"#ff2200":isTWa?"#ff7700":isST?"#ffcc00":"#4488cc";
          return (
            <div key={i} style={{border:`1px solid ${c}70`,borderLeft:`3px solid ${c}`,background:c+"10",borderRadius:6,padding:"9px 11px",marginBottom:7}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{color:c,fontFamily:"monospace",fontSize:11,fontWeight:"bold"}}>{(p.event||"").toUpperCase()}</span>
                <span style={{color:"#2a4060",fontFamily:"monospace",fontSize:9}}>
                  {p.expires?"EXP "+new Date(p.expires).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}):""}
                </span>
              </div>
              <div style={{color:"#5a7a9a",fontFamily:"monospace",fontSize:10,lineHeight:1.5}}>
                {p.headline||(p.description||"").slice(0,110)+"…"}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:8,color:"#0d1e2e",fontFamily:"monospace",fontSize:8}}>api.weather.gov/alerts · {alerts.length===0&&!loading?"No active alerts":"Live"}</div>
    </div>
  );
}

function HourlyPanel({hrly, hIdx, mob}) {
  if (!hrly || !hrly.time) return null;
  const now = new Date();
  const rows = [];
  for (let i = 0; i < hrly.time.length; i++) {
    if (new Date(hrly.time[i]) < now) continue;
    rows.push(
      <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",
        background:"#07101e",border:`1px solid ${S.border}`,borderRadius:6,
        padding:mob?"6px 4px":"8px 6px",minWidth:mob?44:50}}>
        <div style={{color:S.dim,fontSize:9,fontFamily:"monospace"}}>
          {new Date(hrly.time[i]).toLocaleTimeString("en-US",{hour:"numeric",hour12:true}).replace(" ","").toLowerCase()}
        </div>
        <div style={{fontSize:13,margin:"3px 0"}}>{WX_ICON[hrly.weather_code?.[i]]||"🌡"}</div>
        <div style={{color:S.text,fontSize:11,fontFamily:"monospace",fontWeight:"bold"}}>
          {hrly.temperature_2m?.[i]!=null?Math.round(hrly.temperature_2m[i])+"°":"--"}
        </div>
        <div style={{color:"#1a5a88",fontSize:9,fontFamily:"monospace",marginTop:2}}>
          {hrly.precipitation_probability?.[i]!=null?hrly.precipitation_probability[i]+"%":""}
        </div>
      </div>
    );
    if (rows.length >= 10) break;
  }
  return (
    <div style={{background:S.bg,border:`1px solid ${S.border}`,borderRadius:8,padding:mob?"9px 11px":"11px 13px",marginBottom:8}}>
      <div style={{color:"#1a3a5a",fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:7}}>NEXT 10 HOURS — HOURLY OUTLOOK</div>
      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:3}}>{rows}</div>
    </div>
  );
}
