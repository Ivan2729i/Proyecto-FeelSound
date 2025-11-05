// ===== FLASH con Shadow DOM (indestructible) ================================
(() => {
  if (window.__FlashInit) return; window.__FlashInit = true;

  const ICON = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
  const PAL  = {
    success:{ bg:'#10b981', fg:'#fff',  glow:'rgba(16,185,129,0.45)' },
    error:  { bg:'#f43f5e', fg:'#fff',  glow:'rgba(244,63,94,0.45)'  },
    warning:{ bg:'#f59e0b', fg:'#111', glow:'rgba(245,158,11,0.45)' },
    info:   { bg:'#0ea5e9', fg:'#fff',  glow:'rgba(14,165,233,0.45)' }
  };
  const CARRY_KEY = 'fs_flash_payload';

  // --- Portal + ShadowRoot ---------------------------------------------------
  function getPortal() {
    let host = document.getElementById('fs-toast-portal');
    if (!host) {
      host = document.createElement('div');
      host.id = 'fs-toast-portal';
      // pegado al viewport, z-index máximo y fuera de cualquier stacking por transform
      Object.assign(host.style, {
        position:'fixed', top:'0', left:'0', width:'0', height:'0',
        zIndex:'2147483647', pointerEvents:'none'
      });
      // muy importante: colgarlo del <html>, no del <body>
      document.documentElement.appendChild(host);
      host.attachShadow({ mode:'open' });
      const s = document.createElement('style');
      s.textContent = `
        :host { all: initial; }
        .stack { position: fixed; top: 2rem; left: 50%; transform: translateX(-50%);
                 display:flex; flex-direction:column; gap:12px; pointer-events:none; }
        .toast { pointer-events:auto; min-width:320px; max-width:520px;
                 border-radius:16px; padding:14px 18px; display:flex; gap:12px;
                 align-items:flex-start; backdrop-filter: blur(6px);
                 transition: all .25s ease; opacity:0; transform:translateY(-6px); position:relative; }
        .ico { font-size:18px; line-height:1; margin-top:2px }
        .title { font-weight:800; letter-spacing:-0.01em }
        .text { opacity:.95; font-size:13px; line-height:1.25 }
        .close { margin-left:auto; margin-top:-4px; background:transparent; border:0; cursor:pointer;
                 font-size:16px; opacity:.85; color:inherit }
        .barbg { position:absolute; left:0; right:0; bottom:0; border-radius:0 0 16px 16px; overflow:hidden; }
        .barbg > div { height:3px; width:100%; background:#ffffff4D }
        .bar { height:3px; width:100%; background:#ffffffE6; transform-origin:left; transform:scaleX(1) }
      `;
      const wrapper = document.createElement('div');
      wrapper.className = 'stack';
      host.shadowRoot.appendChild(s);
      host.shadowRoot.appendChild(wrapper);
    }
    return host.shadowRoot.querySelector('.stack');
  }

  function toast({type='info', title='', text='', timeout=3200} = {}) {
    const pal = PAL[type] || PAL.info;
    const stack = getPortal();

    const el = document.createElement('div');
    el.className = 'toast';
    el.style.background = pal.bg;
    el.style.color = pal.fg;
    el.style.boxShadow = `0 10px 30px -10px ${pal.glow}`;
    el.style.border = `1px solid ${pal.fg}1A`;

    const ico = document.createElement('div'); ico.className = 'ico'; ico.textContent = ICON[type] || ICON.info;
    const box = document.createElement('div');
    if (title) { const t = document.createElement('div'); t.className='title'; t.textContent = title; box.appendChild(t); }
    if (text)  { const p = document.createElement('div'); p.className='text';  p.textContent = text;  box.appendChild(p); }
    const close = document.createElement('button'); close.className='close'; close.textContent='×'; close.setAttribute('aria-label','Cerrar');

    const barbg = document.createElement('div'); barbg.className = 'barbg';
    const barbgInner = document.createElement('div');
    const bar = document.createElement('div'); bar.className = 'bar';
    barbg.appendChild(barbgInner); barbgInner.appendChild(bar);

    el.append(ico, box, close, barbg);
    stack.appendChild(el);

    // entrada
    requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateY(0)'; });

    const remove = () => { el.style.opacity='0'; el.style.transform='translateY(-6px) scale(.98)'; setTimeout(()=>el.remove(), 220); };
    close.addEventListener('click', remove);

    if (timeout > 0) {
      bar.style.transition = `transform ${timeout}ms linear`;
      void bar.offsetWidth; bar.style.transform = 'scaleX(0)';
      setTimeout(remove, timeout + 30);
    }
  }

  // API pública
  window.Flash = {
    show: (p)=> toast(p||{}),
    carry: (p)=> { try { sessionStorage.setItem(CARRY_KEY, JSON.stringify(p||{})); } catch {} },
    deliver: ()=> {
      try { const raw = sessionStorage.getItem(CARRY_KEY); if (!raw) return;
            sessionStorage.removeItem(CARRY_KEY);
            const data = JSON.parse(raw);
            if (data && (data.text || data.title)) toast(data);
      } catch {}
    },
    fromQuery: ()=> {
      const q = new URLSearchParams(location.search); const f = q.get('flash'); if (!f) return;
      let p; try { p = f.trim().startsWith('{') ? JSON.parse(f) : (([t,...r]=f.split(':')), {type:t||'info', text:r.join(':')}); }
      catch { p = { type:'info', text:f }; }
      try { const u = new URL(location.href); u.searchParams.delete('flash'); history.replaceState({},'',u.toString()); } catch {}
      toast(p);
    },
    // util de diagnóstico
    test: ()=> toast({type:'success', title:'Flash OK', text:'Shadow DOM activo', timeout:1800})
  };

  document.addEventListener('DOMContentLoaded', () => { window.Flash.deliver(); window.Flash.fromQuery(); });
})();
