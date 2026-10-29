import React, { useEffect, useMemo, useState } from 'react';
import { Sprout, MapPin, CloudSun, Droplets, ChartNoAxesCombined, Wheat, Leaf, ShieldAlert, RotateCcw, Printer, ChevronDown, ChevronUp, SlidersHorizontal, CheckCircle2, Info, ArrowRight, Database } from 'lucide-react';
import { predictCandidateScore } from './crop_predictor.js';

const DEFAULT_FARM = {
  state: 'Maharashtra', district: 'Pune', season: 'Kharif', soil_type: 'Black',
  soil_n_mg_kg: 65, soil_p_mg_kg: 40, soil_k_mg_kg: 50, soil_ph: 6.5,
  soil_moisture_pct: 35, avg_temp_c: 26, forecast_rainfall_mm: 800, humidity_pct: 70,
  water_available_mm: 650, groundwater_depth_m: 12, land_size_acres: 2,
  irrigation_source: 'Borewell', previous_crop: 'Wheat', market_trend_pct: 0
};
const CURRENCY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const fmt = (n) => CURRENCY.format(Math.round(Number.isFinite(n) ? n : 0));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export default function App() {
  const [modelData, setModelData] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [schema, setSchema] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [farm, setFarm] = useState(DEFAULT_FARM);
  const [markets, setMarkets] = useState({});
  const [results, setResults] = useState(null);
  const [showMarket, setShowMarket] = useState(false);
  const [activeTab, setActiveTab] = useState('plan');
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/model/crop_model.json').then(r => { if (!r.ok) throw new Error('Could not load the trained model file.'); return r.json(); }),
      fetch('/model/crop_profiles.json').then(r => { if (!r.ok) throw new Error('Could not load crop profiles.'); return r.json(); }),
      fetch('/model/crop_feature_schema.json').then(r => { if (!r.ok) throw new Error('Could not load the feature schema.'); return r.json(); })
    ]).then(([m, p, s]) => {
      setModelData(m); setProfiles(p); setSchema(s);
      const initial = {};
      p.crops.forEach(c => { initial[c.code] = { price: c.base_price, cost: c.base_cost }; });
      setMarkets(initial);
    }).catch(err => setLoadError(err.message));
  }, []);

  const updateFarm = (key, value) => setFarm(prev => ({ ...prev, [key]: value }));
  const runPlan = () => {
    if (!modelData || !profiles || !schema) { setLoadError('The model files are still loading. Refresh the preview and try again.'); return; }
    const soilCode = schema.categorical_codes.soil_type[farm.soil_type];
    const seasonCode = schema.categorical_codes.season[farm.season];
    const irrigationCode = schema.categorical_codes.irrigation_source[farm.irrigation_source];
    const previousCode = schema.categorical_codes.previous_crop[farm.previous_crop];
    const baseCandidates = profiles.crops.map(crop => {
      const market = markets[crop.code] || { price: crop.base_price, cost: crop.base_cost };
      const price = Number(market.price ?? crop.base_price);
      const cost = Number(market.cost ?? crop.base_cost);
      const soilOK = crop.preferred_soils.includes(farm.soil_type);
      const seasonIndex = crop.preferred_seasons.indexOf(farm.season);
      const seasonScore = seasonIndex === 0 ? 100 : seasonIndex > 0 ? 78 : 12;
      const legumeCodes = ['Soybean', 'Chickpea', 'Groundnut'];
      const rotationScore = farm.previous_crop === 'None/Fallow' ? 76 : farm.previous_crop === crop.name ? 22 : legumeCodes.includes(farm.previous_crop) && !legumeCodes.includes(crop.name) ? 91 : legumeCodes.includes(crop.name) ? 84 : 72;
      const pHFit = Number(farm.soil_ph) >= crop.ph_min && Number(farm.soil_ph) <= crop.ph_max;
      const tempDelta = Math.abs(Number(farm.avg_temp_c) - crop.opt_temp);
      const rainDelta = Math.abs(Number(farm.forecast_rainfall_mm) - crop.opt_rain);
      const waterRatio = Number(farm.water_available_mm) / Math.max(crop.water, 1);
      const environmentFactor = clamp(1.04 - tempDelta * 0.012 - rainDelta / Math.max(crop.opt_rain, 250) * 0.13 + (pHFit ? 0.04 : -0.1) + clamp(waterRatio, 0, 1) * 0.08, 0.55, 1.2);
      const estimatedYield = crop.base_yield * environmentFactor;
      const netProfit = estimatedYield * price - cost;
      return { crop, market, price, cost, soilScore: soilOK ? 100 : 58, seasonScore, rotationScore, estimatedYield, netProfit, waterRatio, pHFit, tempDelta, rainDelta };
    });
    const netSorted = [...baseCandidates].sort((a,b) => a.netProfit - b.netProfit);
    baseCandidates.forEach(c => { c.profitabilityPercentile = netSorted.length < 2 ? 50 : (netSorted.findIndex(x => x.crop.code === c.crop.code) / (netSorted.length - 1)) * 100; });
    const ranked = baseCandidates.map(c => {
      const featureMap = {
        soil_n_mg_kg: Number(farm.soil_n_mg_kg), soil_p_mg_kg: Number(farm.soil_p_mg_kg), soil_k_mg_kg: Number(farm.soil_k_mg_kg),
        soil_ph: Number(farm.soil_ph), soil_moisture_pct: Number(farm.soil_moisture_pct), avg_temp_c: Number(farm.avg_temp_c),
        forecast_rainfall_mm: Number(farm.forecast_rainfall_mm), humidity_pct: Number(farm.humidity_pct), water_available_mm: Number(farm.water_available_mm),
        groundwater_depth_m: Number(farm.groundwater_depth_m), land_size_acres: Number(farm.land_size_acres), season_code: seasonCode,
        soil_type_code: soilCode, irrigation_source_code: irrigationCode, previous_crop_code: previousCode, candidate_crop_code: c.crop.code,
        market_price_inr_per_quintal: c.price, market_trend_pct: Number(farm.market_trend_pct), input_cost_inr_per_acre: c.cost,
        potential_yield_quintal_per_acre: c.estimatedYield, net_profit_potential_inr_per_acre: c.netProfit,
        crop_water_requirement_mm: c.crop.water, crop_opt_temp_c: c.crop.opt_temp, crop_opt_rainfall_mm: c.crop.opt_rain,
        crop_ph_min: c.crop.ph_min, crop_ph_max: c.crop.ph_max, crop_n_need: c.crop.n, crop_p_need: c.crop.p, crop_k_need: c.crop.k,
        soil_compatibility_score: c.soilScore, season_compatibility_score: c.seasonScore, rotation_compatibility_score: c.rotationScore,
        profitability_percentile: c.profitabilityPercentile
      };
      const score = predictCandidateScore(featureMap, modelData);
      const waterRisk = Number(farm.water_available_mm) < c.crop.water ? 'High' : Number(farm.water_available_mm) < c.crop.water * 1.3 ? 'Moderate' : 'Lower';
      const climateRisk = (c.tempDelta > 6 || c.rainDelta > Math.max(450, c.crop.opt_rain * 0.65)) ? 'Elevated' : 'Moderate';
      const risks = [];
      if (c.seasonScore < 50) risks.push('Off-season mismatch');
      if (c.soilScore < 80) risks.push('Soil compatibility check');
      if (waterRisk === 'High') risks.push('Water shortfall risk');
      if (!c.pHFit) risks.push('Soil pH outside profile range');
      if (c.netProfit < 0) risks.push('Indicative net return is negative');
      return { ...c, score, waterRisk, climateRisk, risks, totalProfit: c.netProfit * Number(farm.land_size_acres), totalYield: c.estimatedYield * Number(farm.land_size_acres), sowing: c.crop.sowing[farm.season] || 'Not ideal in selected season', featureMap };
    }).sort((a,b) => b.score - a.score);
    setResults(ranked); setHasRun(true); setActiveTab('plan');
  };

  const best = results?.[0];
  const topThree = results?.slice(0,3) || [];
  const reset = () => { setFarm(DEFAULT_FARM); if (profiles) { const initial = {}; profiles.crops.forEach(c => initial[c.code] = { price:c.base_price, cost:c.base_cost }); setMarkets(initial); } setResults(null); setHasRun(false); setActiveTab('plan'); };

  if (loadError) return <main className="load-error"><div className="error-card"><ShieldAlert size={30}/><h1>Model files couldn't load</h1><p>{loadError}</p><p>Confirm the files exist in <code>public/model/</code> and try the preview again.</p><button className="btn primary" onClick={() => location.reload()}>Refresh app</button></div></main>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#home"><span className="brand-icon"><Sprout size={25}/></span><span><strong>KrishiPlan <em>AI</em></strong><small>SMART CROP PLANNING</small></span></a><nav><a href="#planner">Crop planner</a><a href="#methodology">How it works</a><a href="#limitations">Limitations</a></nav><span className="prototype-tag"><span/> Prototype</span></header>
    <main>
      <section className="hero" id="home"><div className="hero-copy"><div className="eyebrow"><Leaf size={14}/> DATA-DRIVEN FARM PLANNING</div><h1>Make your next crop decision with <span>more clarity.</span></h1><p>Bring soil, weather, water and market assumptions into one crop plan, designed for Indian farms.</p><div className="hero-actions"><a className="btn primary" href="#planner">Create crop plan <ArrowRight size={16}/></a><a className="plain-link" href="#methodology">Explore the method</a></div><div className="hero-metrics"><div><strong>13</strong><span>candidate crops</span></div><div><strong>33</strong><span>model features</span></div><div><strong>ML</strong><span>Random Forest</span></div></div></div><div className="hero-art"><div className="sun"/><div className="hill hill-one"/><div className="hill hill-two"/><div className="field-lines"/><div className="floating-chip chip-one"><Sprout size={17}/><span><b>Crop fit</b><small>Soil + season</small></span></div><div className="floating-chip chip-two"><Droplets size={17}/><span><b>Water-aware</b><small>Resource check</small></span></div><div className="art-label">One plan. Multiple farm factors.</div></div></section>

      <section className="trust-strip"><div><CheckCircle2 size={17}/><span>Soil-aware</span></div><div><CloudSun size={17}/><span>Weather-informed</span></div><div><Droplets size={17}/><span>Water-conscious</span></div><div><ChartNoAxesCombined size={17}/><span>Profitability considered</span></div></section>

      <section className="planner-section" id="planner"><div className="section-heading"><div><div className="eyebrow">YOUR FARM, YOUR CONDITIONS</div><h2>Build your crop plan</h2><p>Enter your farm details. Edit the example inputs to explore how crop rankings change.</p></div><button className="btn secondary" onClick={reset}><RotateCcw size={15}/> Reset example</button></div>
        <div className="planner-grid"><div className="form-panel"><div className="panel-title"><span className="step-num">01</span><div><h3>Farm profile</h3><p>Location, soil and farm history</p></div></div>
          <div className="field-grid"><Field label="State" value={farm.state} onChange={v=>updateFarm('state',v)} /><Field label="District" value={farm.district} onChange={v=>updateFarm('district',v)} /><SelectField label="Season" value={farm.season} onChange={v=>updateFarm('season',v)} options={['Kharif','Rabi','Zaid']} /><SelectField label="Soil type" value={farm.soil_type} onChange={v=>updateFarm('soil_type',v)} options={['Sandy','Red','Black','Clay','Loam','Alluvial']} /><SelectField label="Previous crop" value={farm.previous_crop} onChange={v=>updateFarm('previous_crop',v)} options={['None/Fallow','Rice','Wheat','Maize','Soybean','Cotton','Chickpea','Groundnut','Pearl Millet','Sorghum','Sugarcane','Onion','Tomato','Turmeric']} /><SelectField label="Irrigation source" value={farm.irrigation_source} onChange={v=>updateFarm('irrigation_source',v)} options={['Rainfed','Borewell','Canal','Drip','Pond']} /><NumberField label="Land size" suffix="acres" value={farm.land_size_acres} min="0.1" step="0.1" onChange={v=>updateFarm('land_size_acres',v)} /><NumberField label="Water available" suffix="mm / season" value={farm.water_available_mm} min="0" step="10" onChange={v=>updateFarm('water_available_mm',v)} /></div>
          <div className="divider"/><div className="panel-title"><span className="step-num">02</span><div><h3>Soil & weather</h3><p>Use soil-test results and a forecast if available</p></div></div>
          <div className="field-grid three"><NumberField label="Nitrogen (N)" suffix="mg/kg*" value={farm.soil_n_mg_kg} min="0" step="1" onChange={v=>updateFarm('soil_n_mg_kg',v)} /><NumberField label="Phosphorus (P)" suffix="mg/kg*" value={farm.soil_p_mg_kg} min="0" step="1" onChange={v=>updateFarm('soil_p_mg_kg',v)} /><NumberField label="Potassium (K)" suffix="mg/kg*" value={farm.soil_k_mg_kg} min="0" step="1" onChange={v=>updateFarm('soil_k_mg_kg',v)} /><NumberField label="Soil pH" suffix="pH" value={farm.soil_ph} min="3" max="10" step="0.1" onChange={v=>updateFarm('soil_ph',v)} /><NumberField label="Soil moisture" suffix="%" value={farm.soil_moisture_pct} min="0" max="100" step="1" onChange={v=>updateFarm('soil_moisture_pct',v)} /><NumberField label="Groundwater depth" suffix="metres" value={farm.groundwater_depth_m} min="0" step="0.5" onChange={v=>updateFarm('groundwater_depth_m',v)} /><NumberField label="Avg. temperature" suffix="°C" value={farm.avg_temp_c} min="-5" max="55" step="0.5" onChange={v=>updateFarm('avg_temp_c',v)} /><NumberField label="Seasonal rainfall" suffix="mm" value={farm.forecast_rainfall_mm} min="0" step="10" onChange={v=>updateFarm('forecast_rainfall_mm',v)} /><NumberField label="Humidity" suffix="%" value={farm.humidity_pct} min="0" max="100" step="1" onChange={v=>updateFarm('humidity_pct',v)} /></div>
          <p className="unit-note">*NPK inputs use illustrative model units. Confirm units and test methods before using real soil data.</p>
          <div className="market-toggle" role="button" tabIndex="0" onClick={()=>setShowMarket(!showMarket)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setShowMarket(!showMarket)}}><div className="market-toggle-icon"><SlidersHorizontal size={17}/></div><div><strong>Market price & cost assumptions</strong><small>Edit the assumed price and input cost for every crop.</small></div>{showMarket?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</div>
          {showMarket && profiles && <div className="market-editor"><div className="market-head"><span>Crop</span><span>Price / quintal (₹)</span><span>Cost / acre (₹)</span></div>{profiles.crops.map(c=>{const m=markets[c.code]||{price:c.base_price,cost:c.base_cost};return <div className="market-row" key={c.code}><b>{c.name}</b><input type="number" min="0" value={m.price} onChange={e=>setMarkets(prev=>({...prev,[c.code]:{...m,price:e.target.value}}))}/><input type="number" min="0" value={m.cost} onChange={e=>setMarkets(prev=>({...prev,[c.code]:{...m,cost:e.target.value}}))}/></div>})}<label className="field"><span>Expected market trend (%)</span><input type="number" value={farm.market_trend_pct} step="1" onChange={e=>updateFarm('market_trend_pct',e.target.value)}/></label><small className="unit-note">All prices and costs are editable assumptions, not live mandi quotes.</small></div>}
          <button className="btn primary run-button" onClick={runPlan}><Wheat size={18}/>{hasRun?'Update crop recommendations':'Generate crop recommendations'}<ArrowRight size={16}/></button>
          <p className="form-footnote"><Info size={14}/> This demo runs a trained synthetic Random Forest model in your browser.</p>
        </div>

        <div className="results-panel"><div className="results-head"><div><div className="eyebrow">YOUR PERSONALIZED OVERVIEW</div><h3>Crop recommendations</h3></div><span className="ai-badge"><span/> {modelData?'Model ready':'Loading model…'}</span></div>
          {!results ? <div className="empty-state"><div className="empty-illustration"><Sprout size={45}/></div><h3>Your crop plan will appear here</h3><p>Submit the farm details to rank 13 candidate crops using the trained model.</p><div className="empty-points"><span><CheckCircle2 size={15}/> Crop suitability</span><span><CheckCircle2 size={15}/> Yield & return estimates</span><span><CheckCircle2 size={15}/> Water & risk indicators</span></div></div> : <>
            <div className="results-tabs"><button className={activeTab==='plan'?'active':''} onClick={()=>setActiveTab('plan')}>Recommended plan</button><button className={activeTab==='compare'?'active':''} onClick={()=>setActiveTab('compare')}>Compare all crops</button></div>
            {activeTab==='plan' && <div className="recommendations"><div className="best-card"><div className="best-top"><span className="best-tag">TOP MODEL RANK</span><span className="score-tag">{best.score.toFixed(1)} / 100 score</span></div><div className="best-body"><div className="crop-emoji">🌾</div><div><h2>{best.crop.name}</h2><p>{best.sowing} <span>·</span> {best.crop.days} day typical duration*</p></div></div><div className="score-track"><span style={{width:`${best.score}%`}}/></div><p className="best-description">Ranked highest by the trained model for the inputs entered. This is an educational ranking, not validated agronomic advice.</p><div className="best-stats"><Metric label="Indicative yield" value={`${best.estimatedYield.toFixed(1)} q/ac`} /><Metric label="Indicative net / acre" value={`₹${fmt(best.netProfit)}`} positive={best.netProfit>=0} /><Metric label="Water need" value={`${fmt(best.crop.water)} mm`} /></div></div>
              <div className="plan-summary"><div className="summary-heading"><h4>Why this crop ranked first</h4><span>Model signals</span></div><div className="reason-grid"><Reason icon={<Leaf size={17}/>} title="Soil fit" text={best.soilScore>=80?'Matches the crop profile soil preference.':'Soil type differs from the preferred profile.'} /><Reason icon={<CloudSun size={17}/>} title="Season fit" text={best.seasonScore>=80?'Selected season is listed in the crop profile.':best.seasonScore>=50?'Secondary season in this crop profile.':'Selected season is not listed as preferred.'} /><Reason icon={<Droplets size={17}/>} title="Water check" text={best.waterRisk==='High'?'Estimated available water is below profile demand.':best.waterRisk==='Moderate'?'Water availability is near the profile requirement.':'Available water meets the profile requirement.'} /><Reason icon={<ChartNoAxesCombined size={17}/>} title="Return estimate" text={best.netProfit>=0?'Illustrative return is positive under current entered assumptions.':'Illustrative return is negative under current entered assumptions.'} /></div><div className="risk-line"><ShieldAlert size={16}/><div><strong>Risk checks</strong><p>{best.risks.length ? best.risks.join(' · ') : 'No major rule-based warning from the entered demo inputs; local conditions may differ.'}</p></div></div></div>
              <div className="alternatives"><div className="summary-heading"><h4>Other crops to compare</h4><span>Next best ranked</span></div>{topThree.slice(1).map((r,i)=><div className="alternative-row" key={r.crop.code}><span className="rank-num">0{i+2}</span><span className="crop-dot">{['🌱','🌽'][i]||'🌿'}</span><div className="alt-name"><strong>{r.crop.name}</strong><small>{r.sowing}</small></div><div className="alt-score"><strong>{r.score.toFixed(1)}</strong><small>model score</small></div><div className="alt-profit"><strong className={r.netProfit<0?'negative':''}>₹{fmt(r.netProfit)}</strong><small>net / acre</small></div></div>)}</div>
              <div className="plan-footer"><button className="btn secondary" onClick={()=>window.print()}><Printer size={15}/> Print crop plan</button><span>Land total estimate: <strong>₹{fmt(best.totalProfit)}</strong></span></div>
            </div>}
            {activeTab==='compare' && <div className="comparison"><p>All crops are ranked by the model's predicted synthetic suitability score. Return and yield values are separate illustrative calculations.</p><div className="table-wrap"><table><thead><tr><th>Rank / crop</th><th>Score</th><th>Yield q/ac</th><th>Net ₹/ac</th><th>Water</th><th>Risk flags</th></tr></thead><tbody>{results.map((r,i)=><tr key={r.crop.code}><td><div className="table-crop"><span>{String(i+1).padStart(2,'0')}</span><b>{r.crop.name}</b></div></td><td><div className="score-cell"><span>{r.score.toFixed(1)}</span><div><i style={{width:`${r.score}%`}}/></div></div></td><td>{r.estimatedYield.toFixed(1)}</td><td className={r.netProfit<0?'negative':''}>₹{fmt(r.netProfit)}</td><td><span className={`risk-pill ${r.waterRisk.toLowerCase()}`}>{r.waterRisk}</span></td><td>{r.risks.length?r.risks.join(', '):'—'}</td></tr>)}</tbody></table></div><div className="plan-footer"><button className="btn secondary" onClick={()=>window.print()}><Printer size={15}/> Print comparison</button><span>{results.length} crops evaluated</span></div></div>}
          </>}
        </div></div>
      </section>

      <section className="methodology-section" id="methodology"><div className="section-heading"><div><div className="eyebrow">HOW IT WORKS</div><h2>From farm inputs to one crop plan</h2><p>The prototype connects individual farm inputs to a trained model and a crop comparison view.</p></div></div><div className="method-grid"><Method number="01" icon={<MapPin/>} title="Describe the farm" text="Enter location, soil, season, water, irrigation, land size and previous crop."/><Method number="02" icon={<Database/>} title="Prepare model features" text="Encode 33 input features using the supplied feature schema and crop profiles."/><Method number="03" icon={<ChartNoAxesCombined/>} title="Run trained model" text="Score every candidate crop using the exported Random Forest trees."/><Method number="04" icon={<Sprout/>} title="Compare crop options" text="Display model ranking alongside estimated yield, assumed returns, water demand and risks."/></div></section>

      <section className="limitations" id="limitations"><div className="lim-icon"><Info size={22}/></div><div><h3>Important: educational prototype, not live agricultural advice</h3><p>The model was trained on synthetic records and labels generated from a designed scoring rubric. Soil measurements, prices, yield, water needs, risks and sowing windows are illustrative profile assumptions. No IMD, Soil Health Card, e-NAM or groundwater API is connected. Verify conditions with local agricultural officers and real data before making farming or financial decisions.</p></div></section>
    </main>
    <footer><a className="brand footer-brand" href="#home"><span className="brand-icon"><Sprout size={20}/></span><span><strong>KrishiPlan <em>AI</em></strong><small>FAPE · SELF LEARNING ACTIVITY</small></span></a><span>AI-Based Smart Crop Planning · Synthetic demo</span></footer>
  </div>;
}

function Field({label,value,onChange}) { return <label className="field"><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)} /></label>; }
function SelectField({label,value,onChange,options}) { return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>; }
function NumberField({label,value,onChange,suffix,min,max,step='1'}) { return <label className="field"><span>{label}</span><div className="input-with-suffix"><input type="number" value={value} min={min} max={max} step={step} onChange={e=>onChange(e.target.value)}/>{suffix&&<small>{suffix}</small>}</div></label>; }
function Metric({label,value,positive=true}) { return <div className="metric"><span>{label}</span><strong className={!positive?'negative':''}>{value}</strong></div>; }
function Reason({icon,title,text}) { return <div className="reason"><span className="reason-icon">{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
function Method({number,icon,title,text}) { return <div className="method-card"><span className="method-number">{number}</span><span className="method-icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>; }
