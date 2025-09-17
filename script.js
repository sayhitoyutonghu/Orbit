// Interactive SVG network: You centered, people connected to you, and companies connected to people.
(function(){
    const svg = document.getElementById('network-canvas');
    const NS = 'http://www.w3.org/2000/svg';

    // Sample data (you can edit or add via form)
    const me = { id: 'me', type: 'me', name: 'You', x: 600, y: 400, fx: 600, fy: 400 };
    const people = [
        { id: 'p1', type: 'person', name: 'Alice', x: 340, y: 240, company: 'Acme Ltd' },
        { id: 'p2', type: 'person', name: 'Bob', x: 860, y: 240, company: 'BetaCorp' },
        { id: 'p3', type: 'person', name: 'Clara', x: 600, y: 640, company: 'Acme Ltd' }
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

    const nodes = [me, ...people, ...companies];
    const links = [];
    people.forEach(p => {
        links.push({ source: me.id, target: p.id });
        links.push({ source: p.id, target: p._companyNode.id });
    });

    // Map id -> node
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // SVG groups
    const linkLayer = document.createElementNS(NS, 'g'); linkLayer.setAttribute('id','links');
    const nodeLayer = document.createElementNS(NS, 'g'); nodeLayer.setAttribute('id','nodes');
    svg.appendChild(linkLayer); svg.appendChild(nodeLayer);

    // Create link elements
    links.forEach(l => {
        const ln = document.createElementNS(NS,'line');
        ln.classList.add('link');
        ln.dataset.source = l.source; ln.dataset.target = l.target;
        linkLayer.appendChild(ln);
    });

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
        g.appendChild(text);

        // Position group
        setTranslate(g, n.x, n.y);
        nodeLayer.appendChild(g);

        // Drag behavior for non-locked nodes (me stays fixed)
        if(n.type !== 'me') makeDraggable(g, n);

        // Click to highlight company
        g.addEventListener('click', (ev) => {
            ev.stopPropagation();
            highlightNode(n);
        });
    });

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
        if(!name || !companyName) return;
        const id = 'p_' + (Math.random().toString(36).slice(2,8));
        const p = { id, type: 'person', name, x: Math.random()*600+300, y: Math.random()*400+200, company: companyName };
        p._companyNode = ensureCompany(companyName);
        nodes.push(p); nodeById.set(p.id,p);
        // add link elements
        links.push({ source: me.id, target: p.id });
        links.push({ source: p.id, target: p._companyNode.id });
        // create SVG elements for node and new links
        createLinkElements(); createNodeElement(p);
        form.reset();
    });

    function createLinkElements(){
        // clear and recreate
        while(linkLayer.firstChild) linkLayer.removeChild(linkLayer.firstChild);
        links.forEach(l => {
            const ln = document.createElementNS(NS,'line');
            ln.classList.add('link'); ln.dataset.source = l.source; ln.dataset.target = l.target;
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
        const text = document.createElementNS(NS,'text'); text.setAttribute('class','node-label'); text.setAttribute('x',0); text.setAttribute('y', n.type === 'me' ? -36 : -26); text.setAttribute('text-anchor','middle'); text.textContent = n.name; g.appendChild(text);
        setTranslate(g, n.x, n.y); nodeLayer.appendChild(g);
        if(n.type !== 'me') makeDraggable(g,n);
        g.addEventListener('click', (ev) => { ev.stopPropagation(); highlightNode(n); });
        // update links/positions
        renderAll();
    }

    // ensure company nodes are created in SVG
    companies.forEach(createNodeElement);

    // ensure all links/nodes displayed
    createLinkElements();

})();
