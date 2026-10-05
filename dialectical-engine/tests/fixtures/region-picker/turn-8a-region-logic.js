// VERBATIM extract, design of record: ui_designs/DebateAI Design Document (standalone).html (mtime 2026-10-02 13:46), the artboard component method regionVals(tA, vOk, vBad) that drives the 8a Region field.
regionVals(tA, vOk, vBad) {
    const F = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1F1A5 + c.charCodeAt(0)));
    const C = {
      Africa: 'DZ Algeria,EG Egypt,ET Ethiopia,GH Ghana,KE Kenya,MA Morocco,NG Nigeria,RW Rwanda,SN Senegal,ZA South Africa,TN Tunisia,UG Uganda',
      Asia: 'CN China,IN India,ID Indonesia,JP Japan,MY Malaysia,PK Pakistan,PH Philippines,SG Singapore,KR South Korea,TW Taiwan,TH Thailand,VN Vietnam',
      Europe: 'AT Austria,BE Belgium,BG Bulgaria,HR Croatia,CY Cyprus,CZ Czechia,DK Denmark,EE Estonia,FI Finland,FR France,DE Germany,GR Greece,HU Hungary,IE Ireland,IT Italy,LV Latvia,LT Lithuania,LU Luxembourg,MT Malta,MD Moldova,NL Netherlands,NO Norway,PL Poland,PT Portugal,RO Romania,RS Serbia,SK Slovakia,SI Slovenia,ES Spain,SE Sweden,CH Switzerland,UA Ukraine,GB United Kingdom',
      'Middle East': 'BH Bahrain,IL Israel,JO Jordan,KW Kuwait,LB Lebanon,OM Oman,QA Qatar,SA Saudi Arabia,TR Türkiye,AE United Arab Emirates',
      'North America': 'CA Canada,CR Costa Rica,MX Mexico,PA Panama,US United States',
      'South America': 'AR Argentina,BR Brazil,CL Chile,CO Colombia,EC Ecuador,PE Peru,UY Uruguay',
      Oceania: 'AU Australia,FJ Fiji,NZ New Zealand'
    };
    const STATES = 'Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,District of Columbia,Florida,Georgia,Hawaii,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts,Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey,New Mexico,New York,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania,Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,Washington,West Virginia,Wisconsin,Wyoming'.split(',');
    const st = this.state;
    const open = !!st.regOpen, cont = st.regCont || null, cc = st.regCountry || null, usState = st.regState || '';
    const pickedName = cc ? (C[cont].split(',').find((x) => x.startsWith(cc + ' ')) || '').slice(3) : '';
    const conts = Object.keys(C).map((k) => ({ name: k, count: String(C[k].split(',').length), go: () => this.setState({ regCont: k }), bg: k === cont ? tA.shell : 'transparent', weight: k === cont ? 700 : 500 }));
    const countries = cont ? C[cont].split(',').map((x) => {
      const code = x.slice(0, 2), name = x.slice(3), on = code === cc;
      return { code, name, flag: F(code), bg: on ? tA.shell : 'transparent', weight: on ? 700 : 500, mark: on ? 1 : 0,
        go: () => this.setState({ regCountry: code, regOpen: false, regState: code === 'US' ? st.regState || '' : '' }) };
    }) : [];
    return {
      regOpen: open, regShowConts: open && !cont, regShowCountries: open && !!cont,
      regToggle: () => this.setState({ regOpen: !open, regCont: cc ? cont : null }),
      regBack: () => this.setState({ regCont: null }),
      regConts: conts, regCountries: countries, regContName: cont || '',
      regHasPick: !!cc, regEmpty: !cc,
      regFlag: cc ? F(cc) : '', regLabel: cc ? pickedName : 'Select your region', regPath: cc ? cont + ' · ' + cc : '',
      regBorder: open ? tA.con : tA.hairStrong,
      regIsUS: cc === 'US',
      regStates: [{ v: '', t: 'Select a state' }].concat(STATES.map((s) => ({ v: s, t: s }))),
      regStateVal: usState,
      regStateBorder: cc === 'US' && !usState ? vBad : tA.hairStrong,
      regStateMissing: cc === 'US' && !usState,
      regStateOk: cc === 'US' && !!usState,
      regSetState: (e) => this.setState({ regState: e.target.value }),
      regOkColor: vOk, regBadColor: vBad
    };
  }
