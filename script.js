// Interactive SVG network: You centered, people connected to you, and companies connected to people.
(function(){
    const svg = document.getElementById('network-canvas');
    const NS = 'http://www.w3.org/2000/svg';

    // Sample data (you can edit or add via form)
    const me = { id: 'me', type: 'me', name: 'You', x: 600, y: 400, fx: 600, fy: 400 };
    const people = [
        { id: 'p1', type: 'person', name: 'Alice', x: 340, y: 240, company: 'Acme Ltd' },
        { id: 'p2', type: 'person', name: 'Bob', x: 860, y: 240, company: 'BetaCorp' },
        { id: 'p3', type: 'person', name: 'Clara', x: 600, y: 640, company: 'Acme Ltd' },
        { id: 'p4', type: 'person', name: 'Morgan Light', x: 460, y: 320, company: 'COLLINS' },
        { id: 'p5', type: 'person', name: 'Brain Collins', x: 560, y: 320, company: 'COLLINS' }
    ];
    const companies = [];

    // Create company nodes from people
    function ensureCompany(name){
        let c = companies.find(cc => cc.name === name);
        if(!c){
            c = { id: 'c_' + (companies.length+1), type: 'company', name, x: Math.random()*1000+100, y: Math.random()*200+80 };
            companies.push(c);
        }
        return c;
    }
    people.forEach(p => p._companyNode = ensureCompany(p.company));

    // Seed COLLINS company metadata if present
    const collins = companies.find(c => c.name === 'COLLINS');
    if(collins){
        collins.url = 'https://www.wearecollins.com/';
        collins.address = '457 Grand St Ground floor, Brooklyn, NY 11211';
        collins.notes = 'I was volunteered for an event in Collins. I knew Morgan Light and Brain Collins. I was the winner of NVA 2024 and Collins designed the award; I brought my award and took a photo in Collins.';
    }

    const nodes = [me, ...people, ...companies];
    let links = [];
    // Build base links (user->person, person->company) and colleague links
    function updateLinks(){
        const newLinks = [];
        // user to each person
        nodes.forEach(n => { if(n.type==='person') newLinks.push({ source: me.id, target: n.id, type: 'membership' }); });
        // person to company
        nodes.forEach(n => { if(n.type==='person' && n._companyNode) newLinks.push({ source: n.id, target: n._companyNode.id, type: 'employment' }); });
        // colleague links: for each company, connect every pair of people who share it
        const byCompany = {};
        nodes.forEach(n => { if(n.type==='person' && n.company){ byCompany[n.company] = byCompany[n.company] || []; byCompany[n.company].push(n); } });
        Object.values(byCompany).forEach(list => {
            for(let i=0;i<list.length;i++){
                for(let j=i+1;j<list.length;j++){
                    newLinks.push({ source: list[i].id, target: list[j].id, type: 'colleague' });
                }
            }
        });
        links = newLinks;
        createLinkElements();
        // run a short auto-layout to reduce overlaps and keep links clear
        autoLayout();
    }
    // initial building of links will happen after SVG layers are created

    // Map id -> node
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // SVG groups
    const linkLayer = document.createElementNS(NS, 'g'); linkLayer.setAttribute('id','links');
    const nodeLayer = document.createElementNS(NS, 'g'); nodeLayer.setAttribute('id','nodes');
    svg.appendChild(linkLayer); svg.appendChild(nodeLayer);

    // Link layer will be populated by createLinkElements() which uses the computed `links` array

    // Create node elements
    nodes.forEach(n => {
        const g = document.createElementNS(NS,'g');
        g.classList.add('node'); g.dataset.id = n.id;
        if(n.type) g.classList.add(n.type);

        const circle = document.createElementNS(NS,'circle');
        circle.setAttribute('r', n.type === 'me' ? 26 : n.type === 'company' ? 20 : 18);
        g.appendChild(circle);

        const text = document.createElementNS(NS,'text');
        text.setAttribute('class','node-label');
        text.setAttribute('x', 0); text.setAttribute('y', n.type === 'me' ? -36 : -26);
        text.setAttribute('text-anchor','middle');
        text.textContent = n.name;
        // determine best text color for contrast based on node type
        const fillMap = { me: '#06b6d4', person: '#7dd3fc', company: '#fbbf24' };
        const fillColor = fillMap[n.type] || '#7dd3fc';
        // helper: compute relative luminance
        function luminance(hex){
            const c = hex.replace('#','');
            const r = parseInt(c.substring(0,2),16)/255;
            const g2 = parseInt(c.substring(2,4),16)/255;
            const b = parseInt(c.substring(4,6),16)/255;
            const srgb = [r,g2,b].map(v => v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4));
            return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
        }
        const lum = luminance(fillColor);
        if(lum < 0.5){
            text.setAttribute('fill','#ffffff');
            text.setAttribute('stroke','rgba(3,16,23,0.35)');
            text.setAttribute('stroke-width','0.6');
        } else {
            text.setAttribute('fill','#072033');
            text.setAttribute('stroke','rgba(255,255,255,0.8)');
            text.setAttribute('stroke-width','0.6');
        }
        g.appendChild(text);

        // Position group
        setTranslate(g, n.x, n.y);
        nodeLayer.appendChild(g);

        // Drag behavior for non-locked nodes (me stays fixed)
        if(n.type !== 'me') makeDraggable(g, n);

        // Click to highlight company and open editor
        g.addEventListener('click', (ev) => {
            ev.stopPropagation();
            highlightNode(n);
            if(typeof openEditPanel === 'function') openEditPanel(n);
        });
        // Hover tooltip
        g.addEventListener('pointerenter', (ev) => { if(typeof showTooltipFor === 'function') showTooltipFor(n, ev); });
        g.addEventListener('pointermove', (ev) => { if(typeof moveTooltip === 'function') moveTooltip(ev); });
        g.addEventListener('pointerleave', (ev) => { if(typeof hideTooltip === 'function') hideTooltip(); });
    });

    // build initial links now that nodeLayer exists
    updateLinks();

    // Deselect when clicking background
    svg.addEventListener('click', () => clearHighlight());

    // Static layout: nodes don't move unless dragged or added.
    // Initial render: set positions for nodes and links.
    function renderAll(){
        // ensure 'me' fixed position
        me.x = me.fx; me.y = me.fy;
        nodeLayer.querySelectorAll('g.node').forEach(g => {
            const id = g.dataset.id; const n = nodeById.get(id);
            setTranslate(g, n.x, n.y);
        });
        linkLayer.querySelectorAll('line').forEach(line => {
            const s = nodeById.get(line.dataset.source); const t = nodeById.get(line.dataset.target);
            if(s && t){
                line.setAttribute('x1', s.x); line.setAttribute('y1', s.y);
                line.setAttribute('x2', t.x); line.setAttribute('y2', t.y);
            }
        });
    }
    // Initial render call
    renderAll();

    // Helpers
    function setTranslate(elem,x,y){ elem.setAttribute('transform', `translate(${x},${y})`); }

    function makeDraggable(g, node){
        let dragging = false; let start = null;
        g.addEventListener('pointerdown', (ev) => { ev.preventDefault(); g.setPointerCapture(ev.pointerId); dragging = true; start = {x:ev.clientX, y:ev.clientY}; });
        window.addEventListener('pointermove', (ev) => {
            if(!dragging) return;
            const dx = ev.clientX - start.x; const dy = ev.clientY - start.y;
            start.x = ev.clientX; start.y = ev.clientY;
            node.x += dx; node.y += dy;
            // move the SVG group immediately
            const grp = nodeLayer.querySelector(`g.node[data-id="${node.id}"]`);
            if(grp) setTranslate(grp, node.x, node.y);
            // update any links connected to this node
            linkLayer.querySelectorAll('line').forEach(line => {
                if(line.dataset.source === node.id){ line.setAttribute('x1', node.x); line.setAttribute('y1', node.y); }
                if(line.dataset.target === node.id){ line.setAttribute('x2', node.x); line.setAttribute('y2', node.y); }
            });
        });
        window.addEventListener('pointerup', (ev) => { if(dragging){ dragging=false; try{ g.releasePointerCapture(ev.pointerId); }catch(e){} } });
    }

    // Lightweight auto-layout to reduce overlaps and avoid nodes sitting on top of links.
    function autoLayout(){
        // parameters
        const iterations = 60; // short run
        const width = 1200, height = 800;
        const k = Math.sqrt((width * height) / Math.max(1, nodes.length));

        for(let it=0; it<iterations; it++){
            // repulsive forces
            nodes.forEach(a => { a.vx = a.vx || 0; a.vy = a.vy || 0; });
            for(let i=0;i<nodes.length;i++){
                for(let j=i+1;j<nodes.length;j++){
                    const a = nodes[i], b = nodes[j];
                    const dx = a.x - b.x; const dy = a.y - b.y;
                    let dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    const minDist = 60; // target spacing
                    const repulse = (k * k) / dist;
                    const ux = dx / dist, uy = dy / dist;
                    a.vx += ux * repulse * 0.02; a.vy += uy * repulse * 0.02;
                    b.vx -= ux * repulse * 0.02; b.vy -= uy * repulse * 0.02;
                }
            }
            // attractive forces along existing links
            links.forEach(l => {
                const s = nodeById.get(l.source); const t = nodeById.get(l.target);
                if(!s || !t) return;
                const dx = t.x - s.x; const dy = t.y - s.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                const desired = (l.type === 'colleague') ? 140 : 120;
                const force = (dist - desired) * 0.02;
                const ux = dx / dist, uy = dy / dist;
                s.vx += ux * force; s.vy += uy * force;
                t.vx -= ux * force; t.vy -= uy * force;
            });

            // integrate with damping
            nodes.forEach(n => {
                if(n.type === 'me') { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; return; }
                n.x += (n.vx || 0);
                n.y += (n.vy || 0);
                n.vx *= 0.7; n.vy *= 0.7;
                // keep within bounds
                n.x = Math.max(60, Math.min(1140, n.x)); n.y = Math.max(60, Math.min(740, n.y));
            });
        }
        // update positions in DOM
        renderAll();
    }

    // Highlight logic
    let currentHighlight = null;
    function highlightNode(n){
        clearHighlight();
        currentHighlight = n;
        // highlight links related to this node
        linkLayer.querySelectorAll('line').forEach(l => {
            if(l.dataset.source === n.id || l.dataset.target === n.id) l.classList.add('highlight');
        });
        // if person, also highlight their company
        if(n.type === 'person'){
            const comp = n._companyNode;
            nodeLayer.querySelectorAll('g.node').forEach(g => { if(g.dataset.id === comp.id) g.classList.add('highlight'); });
        }
    }
    function clearHighlight(){
        currentHighlight = null;
        linkLayer.querySelectorAll('line.highlight').forEach(l => l.classList.remove('highlight'));
        nodeLayer.querySelectorAll('g.node.highlight').forEach(g => g.classList.remove('highlight'));
    }

    // Form to add people
    const form = document.getElementById('add-person-form');
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const name = document.getElementById('person-name').value.trim();
        const companyName = document.getElementById('person-company').value.trim();
        const companyUrl = document.getElementById('person-company-url') ? document.getElementById('person-company-url').value.trim() : '';
        const companyAddress = document.getElementById('person-company-address') ? document.getElementById('person-company-address').value.trim() : '';
        const notes = document.getElementById('person-notes') ? document.getElementById('person-notes').value.trim() : '';
        if(!name || !companyName) return;
        const id = 'p_' + (Math.random().toString(36).slice(2,8));
        const p = { id, type: 'person', name, x: Math.random()*600+300, y: Math.random()*400+200, company: companyName, notes };
        p._companyNode = ensureCompany(companyName);
        // set company metadata if provided
        if(companyUrl) p._companyNode.url = companyUrl;
        if(companyAddress) p._companyNode.address = companyAddress;
        nodes.push(p); nodeById.set(p.id,p);
        // recompute links (including colleague links) and create the node
        updateLinks(); createNodeElement(p);
        form.reset();
    });

    function createLinkElements(){
        // clear and recreate
        while(linkLayer.firstChild) linkLayer.removeChild(linkLayer.firstChild);
        links.forEach(l => {
            const ln = document.createElementNS(NS,'line');
            ln.classList.add('link'); ln.dataset.source = l.source; ln.dataset.target = l.target;
            // style by link type
            if(l.type === 'colleague'){
                ln.classList.add('colleague');
                ln.setAttribute('stroke-dasharray','6 4');
                ln.setAttribute('stroke-opacity','0.5');
                ln.setAttribute('stroke','#94a3b8');
                ln.setAttribute('stroke-width','1.6');
            } else if(l.type === 'employment'){
                ln.classList.add('employment');
                ln.setAttribute('stroke','#64748b');
                ln.setAttribute('stroke-width','2');
            } else { // membership
                ln.classList.add('membership');
                ln.setAttribute('stroke','#475569');
                ln.setAttribute('stroke-width','2');
            }
            linkLayer.appendChild(ln);
        });
        // position links immediately
        renderAll();
    }

    function createNodeElement(n){
        // if company new, ensure not duplicate
        if(nodeLayer.querySelector(`g.node[data-id=\"${n.id}\"]`)) return;
        const g = document.createElementNS(NS,'g'); g.classList.add('node'); g.dataset.id = n.id; if(n.type) g.classList.add(n.type);
        const circle = document.createElementNS(NS,'circle'); circle.setAttribute('r', n.type === 'me' ? 26 : n.type === 'company' ? 20 : 18); g.appendChild(circle);
    const text = document.createElementNS(NS,'text'); text.setAttribute('class','node-label'); text.setAttribute('x',0); text.setAttribute('y', n.type === 'me' ? -36 : -26); text.setAttribute('text-anchor','middle'); text.textContent = n.name;
    // contrast logic for dynamically created node
    const fillMap = { me: '#06b6d4', person: '#7dd3fc', company: '#fbbf24' };
    const fillColor = fillMap[n.type] || '#7dd3fc';
    function luminance(hex){ const c = hex.replace('#',''); const r = parseInt(c.substring(0,2),16)/255; const g2 = parseInt(c.substring(2,4),16)/255; const b = parseInt(c.substring(4,6),16)/255; const srgb = [r,g2,b].map(v => v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4)); return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2]; }
    const lum = luminance(fillColor);
    if(lum < 0.5){ text.setAttribute('fill','#ffffff'); text.setAttribute('stroke','rgba(3,16,23,0.35)'); text.setAttribute('stroke-width','0.6'); }
    else { text.setAttribute('fill','#072033'); text.setAttribute('stroke','rgba(255,255,255,0.8)'); text.setAttribute('stroke-width','0.6'); }
    g.appendChild(text);
        setTranslate(g, n.x, n.y); nodeLayer.appendChild(g);
    if(n.type !== 'me') makeDraggable(g,n);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); highlightNode(n); if(typeof openEditPanel === 'function') openEditPanel(n); });
    g.addEventListener('pointerenter', (ev) => { if(typeof showTooltipFor === 'function') showTooltipFor(n, ev); });
    g.addEventListener('pointermove', (ev) => { if(typeof moveTooltip === 'function') moveTooltip(ev); });
    g.addEventListener('pointerleave', (ev) => { if(typeof hideTooltip === 'function') hideTooltip(); });
    // update links/positions
    renderAll();
    }

    // ensure company nodes are created in SVG
    companies.forEach(createNodeElement);

    // ensure all links/nodes displayed
    updateLinks();

    // ------------------ Edit panel and tooltip logic ------------------
    // Elements
    const editPanel = document.getElementById('edit-node-panel');
    const tooltip = document.getElementById('tooltip');
    let editingNode = null;

    function openEditPanel(n){
        editingNode = n;
        if(!editPanel) return;
        editPanel.classList.remove('hidden');
        document.getElementById('edit-name').value = n.name || '';
        document.getElementById('edit-company').value = n.company || '';
        document.getElementById('edit-url').value = (n._companyNode && n._companyNode.url) || n.url || '';
        document.getElementById('edit-address').value = (n._companyNode && n._companyNode.address) || n.address || '';
        document.getElementById('edit-notes').value = n.notes || '';
        document.getElementById('edit-company-label').style.display = n.type === 'company' ? 'none' : 'block';
    }

    function closeEditPanel(){ editingNode = null; if(editPanel) editPanel.classList.add('hidden'); }

    const closeBtn = document.getElementById('close-edit'); if(closeBtn) closeBtn.addEventListener('click', closeEditPanel);
    const saveBtn = document.getElementById('save-node'); if(saveBtn) saveBtn.addEventListener('click', (ev) => {
        ev.preventDefault(); if(!editingNode) return;
        const newName = document.getElementById('edit-name').value.trim();
        const newCompany = document.getElementById('edit-company').value.trim();
        const newUrl = document.getElementById('edit-url').value.trim();
        const newAddress = document.getElementById('edit-address').value.trim();
        const newNotes = document.getElementById('edit-notes').value.trim();
        editingNode.name = newName || editingNode.name;
        editingNode.notes = newNotes;
        editingNode.url = newUrl;
        editingNode.address = newAddress;
        if(newCompany && editingNode.type !== 'company'){
            editingNode.company = newCompany;
            editingNode._companyNode = ensureCompany(newCompany);
            if(newUrl) editingNode._companyNode.url = newUrl;
            if(newAddress) editingNode._companyNode.address = newAddress;
        }
        const g = nodeLayer.querySelector(`g.node[data-id="${editingNode.id}"]`);
        if(g){ const t = g.querySelector('text'); if(t) t.textContent = editingNode.name; }
    createNodeElement(editingNode._companyNode);
    updateLinks(); renderAll(); closeEditPanel();
    });

    const delBtn = document.getElementById('delete-node'); if(delBtn) delBtn.addEventListener('click', (ev) => {
        ev.preventDefault(); if(!editingNode) return;
        const idx = nodes.findIndex(x => x.id === editingNode.id);
        if(idx >= 0) nodes.splice(idx,1);
        nodeById.delete(editingNode.id);
    // recompute links instead of manual splicing so colleague links update
    updateLinks();
    const g = nodeLayer.querySelector(`g.node[data-id="${editingNode.id}"]`); if(g) g.remove();
    updateLinks(); renderAll(); closeEditPanel();
    });

    function showTooltipFor(n, ev){
        if(!tooltip) return;
        const title = n.name || '';
        const company = n.company || (n._companyNode && n._companyNode.name) || '';
        const url = (n._companyNode && n._companyNode.url) || n.url || '';
        const address = (n._companyNode && n._companyNode.address) || n.address || '';
        const notes = n.notes || '';
        tooltip.innerHTML = `<h4>${escapeHtml(title)}</h4>` +
            (company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : '') +
            (url ? `<p><strong>URL:</strong> <a href="${escapeAttr(url)}" target="_blank">${escapeHtml(url)}</a></p>` : '') +
            (address ? `<p><strong>Address:</strong> ${escapeHtml(address)}</p>` : '') +
            (notes ? `<p>${escapeHtml(notes)}</p>` : '');
        tooltip.classList.remove('hidden'); moveTooltip(ev);
    }

    function moveTooltip(ev){ if(!tooltip) return; const pad = 12; const x = ev.clientX + pad; const y = ev.clientY + pad; tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px'; }
    function hideTooltip(){ if(tooltip) tooltip.classList.add('hidden'); }

    function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }

})();
