// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD8FxHqt1g2V-mmureRPQyYe6QCuRSieGI",
    authDomain: "marketplaceconnect-af26d.firebaseapp.com",
    databaseURL: "https://marketplaceconnect-af26d-default-rtdb.firebaseio.com",
    projectId: "marketplaceconnect-af26d",
    storageBucket: "marketplaceconnect-af26d.firebasestorage.app",
    messagingSenderId: "768552546759",
    appId: "1:768552546759:web:4367fc4a161ecf90c469e2",
    measurementId: "G-7HHR78MHDP"
};

// Inicializar Firebase
let app, auth, db, storage;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    console.log("Firebase inicializado com sucesso!");
} catch (error) {
    console.error("Erro ao inicializar Firebase:", error);
}

// Estado Global
let currentUser = null;
let currentStore = null;
let processedProductImages = [];
let processedStoreLogo = null;
let loadingOverlay, loadingText, fabAddProduct;

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', function () {
    initApp();
});

function initApp() {
    loadingOverlay = document.getElementById('global-loading');
    loadingText = document.getElementById('loading-text');
    fabAddProduct = document.getElementById('fab-add-product');

    setupEventListeners();
    setupAuthListener();
    setupNavigation();
}

// --- VISUALIZAÇÃO SKELETON / LOADING ---

function renderProductSkeleton(count = 4) {
    return Array(count).fill(0).map(() => `
        <div class="product-card skeleton-card">
            <div class="skeleton skeleton-rect" style="aspect-ratio: 1; height: auto;"></div>
            <div class="product-info">
                <div class="skeleton skeleton-text" style="width: 40%"></div>
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text" style="width: 60%; margin-top: auto;"></div>
            </div>
        </div>
    `).join('');
}

function renderStoreSkeleton(count = 3) {
    return Array(count).fill(0).map(() => `
        <div class="store-card">
            <div class="skeleton skeleton-avatar"></div>
            <div style="flex: 1;">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
            </div>
        </div>
    `).join('');
}

// --- NAVEGAÇÃO ---

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-list a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.id.replace('nav-', '');

            // Proteção de rotas
            if ((pageId === 'my-store' || pageId === 'add-product') && !currentUser) {
                showPage('login');
                showAlert('login-alert', 'Faça login para acessar esta área.', 'info');
                return;
            }

            showPage(pageId);
        });
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-list a').forEach(link => link.classList.remove('active'));

    const mapIdToPage = {
        'home': 'home-page',
        'products': 'products-page',
        'stores': 'stores-page',
        'my-store': 'my-store-page',
        'login': 'login-page',
        'register': 'register-page',
        'add-product': 'add-product-page',
        'addProduct': 'add-product-page',
        'myStore': 'my-store-page',
        'store-profile': 'store-profile-page'
    };

    const targetId = mapIdToPage[pageId] || pageId + '-page';
    const targetPage = document.getElementById(targetId);

    if (targetPage) {
        targetPage.classList.add('active');

        const navIdMap = {
            'home-page': 'nav-home',
            'products-page': 'nav-products',
            'stores-page': 'nav-stores',
            'my-store-page': 'nav-my-store',
            'add-product-page': 'nav-add-product'
        };
        const navLink = document.getElementById(navIdMap[targetId]);
        if (navLink) navLink.classList.add('active');

        if (pageId === 'home') loadFeaturedProducts();
        if (pageId === 'products') loadAllProducts();
        if (pageId === 'stores') loadAllStores();
        if (pageId === 'my-store' || pageId === 'myStore') loadMyStore();
    }
}

// --- AUTENTICAÇÃO ---

function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            updateUserUI(user);
            await loadUserStore();
            if (document.getElementById('login-page').classList.contains('active')) {
                showPage('home');
            }
            if (fabAddProduct) fabAddProduct.style.display = 'flex';
        } else {
            resetUserUI();
            currentStore = null;
            if (fabAddProduct) fabAddProduct.style.display = 'none';
        }
    });
}

function updateUserUI(user) {
    document.getElementById('user-greeting').textContent = user.displayName || user.email.split('@')[0];
}

function resetUserUI() {
    document.getElementById('user-greeting').textContent = 'Visitante';
}

// --- LOGICA DE DADOS ---

let allProductsCache = []; // Client-side cache for search/filtering

async function loadFeaturedProducts() {
    const container = document.getElementById('featured-products');
    container.innerHTML = renderProductSkeleton(4);

    try {
        let snapshot;
        try {
            snapshot = await db.collection('products')
                .where('status', '==', 'active')
                .orderBy('createdAt', 'desc')
                .limit(10)
                .get();
        } catch (idxError) {
            console.warn("Retrying featured without index", idxError);
            snapshot = await db.collection('products').limit(20).get();
        }

        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>Nenhum destaque no momento.</p></div>';
            return;
        }

        snapshot.forEach(doc => renderProduct(doc, container));
    } catch (e) {
        console.error("Erro geral:", e);
        container.innerHTML = '<p class="error-text">Não foi possível carregar os destaques.</p>';
    }
}

async function loadAllProducts() {
    const container = document.getElementById('products-list');
    container.innerHTML = renderProductSkeleton(8);

    try {
        let snapshot;
        try {
            snapshot = await db.collection('products')
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();
        } catch (idxError) {
            console.warn("Index ausente em Produtos? Fallback.", idxError);
            snapshot = await db.collection('products').limit(100).get();
        }

        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-state"><p>Nenhum produto cadastrado.</p></div>';
            return;
        }

        allProductsCache = []; // Reset cache
        snapshot.forEach(doc => {
            const data = doc.data();
            const product = { id: doc.id, ...data };
            allProductsCache.push(product);
            renderProduct(doc, container);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p>Erro ao listar produtos.</p>';
    }
}

// --- PESQUISA & FILTROS ---

function filterByCategory(category) {
    // UI Update
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');

    // Logic
    const container = document.getElementById('products-list');
    container.innerHTML = '';

    let filtered = allProductsCache;
    if (category !== 'all') {
        filtered = allProductsCache.filter(p => p.category === category);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Nenhum produto nesta categoria.</p></div>';
        return;
    }

    filtered.forEach(p => {
        // Mock doc object for renderProduct
        renderProduct({ id: p.id, data: () => p }, container);
    });
}

function setupSearch() {
    const input = document.getElementById('search-products');
    const suggestionsBox = document.getElementById('search-suggestions');

    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();

        // 1. Filter Grid Logic
        const container = document.getElementById('products-list');
        container.innerHTML = '';

        const filtered = allProductsCache.filter(p =>
            p.name.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term))
        );

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Nada encontrado.</p></div>';
        } else {
            filtered.forEach(p => renderProduct({ id: p.id, data: () => p }, container));
        }

        // 2. Suggestions Dropdown Logic
        if (term.length > 0) {
            const matches = allProductsCache
                .filter(p => p.name.toLowerCase().includes(term))
                .slice(0, 5); // Max 5 suggestions

            if (matches.length > 0) {
                suggestionsBox.innerHTML = matches.map(p => `
                    <div class="suggestion-item" onclick="openSuggestion('${p.id}')">
                        <img src="${p.imageUrls?.[0] || 'https://via.placeholder.com/40'}" class="suggestion-thumb">
                        <div class="suggestion-info">
                            <h4>${p.name}</h4>
                            <p>${parseFloat(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                    </div>
                `).join('');
                suggestionsBox.classList.remove('hidden');
            } else {
                suggestionsBox.classList.add('hidden');
            }
        } else {
            suggestionsBox.classList.add('hidden');
        }
    });

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.add('hidden');
        }
    });

    setupFilterScroll();
}

function setupFilterScroll() {
    const slider = document.getElementById('filter-scroll-container');
    if (!slider) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.style.cursor = 'grabbing';
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.style.cursor = 'grab';
    });

    slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.style.cursor = 'grab';
    });

    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast
        slider.scrollLeft = scrollLeft - walk;
    });
}

function openSuggestion(productId) {
    const product = allProductsCache.find(p => p.id === productId);
    if (product) {
        showProductDetails(product);
        document.getElementById('search-suggestions').classList.add('hidden');
    }
}


async function loadAllStores() {
    const container = document.getElementById('stores-list');
    container.innerHTML = renderStoreSkeleton(5);

    try {
        let snapshot;
        try {
            snapshot = await db.collection('stores').orderBy('createdAt', 'desc').limit(20).get();
        } catch (e) {
            snapshot = await db.collection('stores').limit(20).get();
        }

        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-state"><p>Nenhuma loja cadastrada.</p></div>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'store-card';
            // CHANGED: Open profile instead of WhatsApp directly
            div.onclick = () => openStoreProfile(doc.id, data);

            div.innerHTML = `
                <img src="${data.logoUrl || 'https://via.placeholder.com/80?text=LOGO'}" class="store-avatar">
                <div style="flex:1">
                    <h3 style="color:var(--primary-color)">${data.name}</h3>
                    <p>${data.description}</p>
                    <small style="color:var(--secondary-color); font-weight:600;">Ver Produtos</small>
                </div>
                <i class="fas fa-chevron-right" style="color:#ccc;"></i>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = '<p>Erro ao carregar lojas.</p>';
    }
}

// --- STORE PROFILE (PUBLIC) ---

async function openStoreProfile(storeId, storeData) {
    // 1. Setup Page Structure
    showPage('store-profile'); // Helper will map this to 'store-profile-page'

    // 2. Render Header
    const header = document.getElementById('store-profile-header');
    header.innerHTML = `
        <img src="${storeData.logoUrl || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:4px solid white; box-shadow:var(--shadow-md); margin-bottom:15px;">
        <h2 style="font-size:1.8rem; margin-bottom:8px;">${storeData.name}</h2>
        <p style="color:#666; max-width:500px; margin:0 auto 20px;">${storeData.description}</p>
        <button class="btn btn-whatsapp" style="max-width:250px; margin:0 auto;" onclick="window.open('https://wa.me/55${storeData.phone.replace(/\D/g, '')}', '_blank')">
            <i class="fab fa-whatsapp"></i> Falar com a Loja
        </button>
    `;

    // 3. Load Products
    const container = document.getElementById('store-profile-products');
    container.innerHTML = renderProductSkeleton(6);

    try {
        const snap = await db.collection('products')
            .where('storeId', '==', storeId)
            .orderBy('createdAt', 'desc')
            .get();

        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<div class="empty-state"><p>Esta loja ainda não tem produtos.</p></div>';
            return;
        }

        snap.forEach(doc => renderProduct(doc, container));
    } catch (e) {
        console.warn("Index fallback for store profile");
        const snap = await db.collection('products').where('storeId', '==', storeId).get();
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<div class="empty-state"><p>Esta loja ainda não tem produtos.</p></div>';
            return;
        }
        snap.forEach(doc => renderProduct(doc, container));
    }
}

// --- RENDERIZAÇÃO ---

function renderProduct(doc, container, isOwner = false) {
    const data = doc.data();
    const div = document.createElement('div');
    div.className = 'product-card';
    div.onclick = () => showProductDetails({ id: doc.id, ...data });

    const imgUrl = (data.imageUrls && data.imageUrls[0]) ? data.imageUrls[0] : 'https://via.placeholder.com/300?text=Foto';
    const priceFormatted = parseFloat(data.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let isNew = false;
    if (data.createdAt && (Date.now() - data.createdAt.toMillis()) < 86400000) isNew = true;

    div.innerHTML = `
        <div style="position:relative;">
            <img src="${imgUrl}" class="product-image" loading="lazy" alt="${data.name}">
            ${isNew ? '<span style="position:absolute; top:8px; left:8px; background:var(--accent-color); color:white; padding:2px 8px; font-size:0.7rem; border-radius:10px; font-weight:700;">NOVO</span>' : ''}
        </div>
        <div class="product-info">
            <div class="product-category">${data.category || 'Geral'}</div>
            <h3 class="product-title">${data.name}</h3>
            <div style="font-size: 0.8rem; color: #888; margin-bottom:4px;">${data.storeName || 'Loja Parceira'}</div>
            <div class="product-price">${priceFormatted}</div>
            ${isOwner ?
            `<button class="btn btn-danger" style="margin-top:auto; padding: 8px;" onclick="event.stopPropagation(); deleteProduct('${doc.id}')"><i class="fas fa-trash"></i> Excluir</button>`
            :
            `<button class="btn btn-whatsapp" style="margin-top:auto;" onclick="event.stopPropagation(); openWhatsApp('${data.storePhone}', '${data.name}')"><i class="fab fa-whatsapp"></i> Ver Detalhes</button>`
        }
        </div>
    `;
    container.appendChild(div);
}

// --- MODALS ---

function showProductDetails(product) {
    const modal = document.getElementById('product-modal');
    const content = document.getElementById('product-modal-content');

    let galleryHtml = `<img src="${product.imageUrls?.[0] || ''}" class="product-image" style="border-radius:12px; margin-bottom:15px; box-shadow:var(--shadow-md);">`;

    if (product.imageUrls?.length > 1) {
        galleryHtml += `<div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:10px;">
            ${product.imageUrls.map(url => `<img src="${url}" style="width:70px; height:70px; border-radius:8px; object-fit:cover; cursor:pointer; border:2px solid transparent;" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='transparent'" onclick="this.parentElement.previousElementSibling.src='${url}'">`).join('')}
        </div>`;
    }

    content.innerHTML = `
        <div style="padding: 24px;">
            ${galleryHtml}
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <span style="background:#e8f5e9; color:var(--primary-dark); padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;">${product.category || 'Geral'}</span>
                    <h2 style="color:#1a1a1a; margin-top:8px;">${product.name}</h2>
                </div>
            </div>
            
            <p style="font-size:1.8rem; font-weight:800; color:var(--primary-color); margin: 15px 0;">${parseFloat(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            
            <div style="background:#fff; border:1px solid #eee; padding:15px; border-radius:8px; margin-bottom:20px;">
                <h4 style="margin-bottom:8px;">Descrição</h4>
                <p style="color:#555; line-height:1.6;">${product.description}</p>
            </div>

            <div style="background:#f0f2f5; padding:20px; border-radius:12px; display:flex; gap:15px; align-items:center;">
                <div style="background:white; width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:var(--primary-color);">
                    <i class="fas fa-store"></i>
                </div>
                <div>
                    <h4 style="margin-bottom:2px;">${product.storeName}</h4>
                    <p style="font-size:0.9rem; color:#666;">Vendedor Verificado</p>
                </div>
            </div>
            <button class="btn btn-whatsapp" style="margin-top:20px; font-size:1.1rem; padding:16px;" onclick="openWhatsApp('${product.storePhone}', '${product.name}')">
                <i class="fab fa-whatsapp"></i> Chamar no WhatsApp
            </button>
        </div>
    `;
    modal.classList.add('active');
}

// --- OPEN EDIT MODAL ---

function openEditStoreModal() {
    if (!currentStore) return;
    document.getElementById('store-name-input').value = currentStore.name;
    document.getElementById('store-description-input').value = currentStore.description;
    document.getElementById('store-phone-input').value = currentStore.phone;
    document.getElementById('store-logo-preview').innerHTML = '<span style="color:var(--text-muted); font-size:0.9rem;">Deixe vazio para manter a logo atual</span>';

    document.getElementById('store-modal').classList.add('active');
}

// --- PROCESSAMENTO DE IMAGEM ---

function processImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const MAX_SIZE = 1280;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Sharpening
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                const w = width;
                const h = height;

                const newBuffer = new Uint8ClampedArray(data);

                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const idx = (y * w + x) * 4;
                        for (let c = 0; c < 3; c++) {
                            const val =
                                -1 * data[((y - 1) * w + x) * 4 + c] +
                                -1 * data[((y + 1) * w + x) * 4 + c] +
                                -1 * data[(y * w + (x - 1)) * 4 + c] +
                                -1 * data[(y * w + (x + 1)) * 4 + c] +
                                5 * data[idx + c];
                            newBuffer[idx + c] = Math.min(255, Math.max(0, val));
                        }
                    }
                }

                for (let i = 0; i < data.length; i++) {
                    if (i % 4 !== 3) data[i] = newBuffer[i];
                }

                ctx.putImageData(imageData, 0, 0);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                        type: "image/jpeg",
                        lastModified: Date.now(),
                    }));
                }, 'image/jpeg', 0.92);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// --- UPLOAD & SALVAMENTO ---

function setupImageUploads() {
    const input = document.getElementById('product-images');
    const preview = document.getElementById('image-preview');

    if (!input) return;

    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length + processedProductImages.length > 4) return alert('Máximo 4 fotos');

        const tempId = 'temp-' + Date.now();
        const loadingDiv = document.createElement('div');
        loadingDiv.id = tempId;
        loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        loadingDiv.style.fontSize = '12px';
        preview.appendChild(loadingDiv);

        for (let file of files) {
            try {
                const processed = await processImage(file);
                processedProductImages.push(processed);

                const div = document.createElement('div');
                div.innerHTML = `<img src="${URL.createObjectURL(processed)}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; border:1px solid #ddd; box-shadow:0 2px 4px rgba(0,0,0,0.1);">`;
                preview.appendChild(div);
            } catch (err) {
                console.error("Erro ao processar imagem", err);
                alert("Erro ao processar uma das imagens.");
            }
        }

        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();
    };

    const logoInput = document.getElementById('store-logo');
    if (logoInput) {
        logoInput.onchange = async (e) => {
            if (e.target.files[0]) {
                processedStoreLogo = e.target.files[0];
                document.getElementById('store-logo-preview').innerHTML = '<span style="color:green; font-weight:bold;">Logo selecionada!</span>';
            }
        }
    }
}

async function handleStoreSave(e) {
    e.preventDefault();
    if (!currentUser) return;

    showLoading();
    try {
        let logoUrl = currentStore ? currentStore.logoUrl : null;
        if (processedStoreLogo) {
            const ref = storage.ref(`stores/${currentUser.uid}/logo_${Date.now()}`);
            await ref.put(processedStoreLogo);
            logoUrl = await ref.getDownloadURL();
        }

        const data = {
            name: document.getElementById('store-name-input').value,
            description: document.getElementById('store-description-input').value,
            phone: document.getElementById('store-phone-input').value,
            ownerId: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!currentStore) {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        if (logoUrl) data.logoUrl = logoUrl;

        if (currentStore) {
            await db.collection('stores').doc(currentStore.id).update(data);
            alert('Loja atualizada!');
        } else {
            await db.collection('stores').add(data);
            alert('Loja criada com sucesso!');
        }

        document.getElementById('store-modal').classList.remove('active');
        processedStoreLogo = null;
        document.getElementById('store-form').reset();
        await loadUserStore();
        showPage('my-store');
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar loja');
    } finally {
        hideLoading();
    }
}

async function handleProductSave(e) {
    e.preventDefault();
    if (!currentStore) return alert('Crie uma loja antes!');
    if (processedProductImages.length === 0) return alert('Adicione pelo menos 1 foto!');

    showLoading('Publicando e Otimizando...');
    try {
        const imageUrls = [];
        for (let file of processedProductImages) {
            const ref = storage.ref(`products/${currentUser.uid}/${Date.now()}_${file.name}`);
            await ref.put(file);
            imageUrls.push(await ref.getDownloadURL());
        }

        const product = {
            name: document.getElementById('product-name').value,
            description: document.getElementById('product-description').value,
            price: parseFloat(document.getElementById('product-price').value),
            category: document.getElementById('product-category').value,
            imageUrls: imageUrls,
            storeId: currentStore.id,
            storeName: currentStore.name,
            storePhone: currentStore.phone,
            sellerId: currentUser.uid,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('products').add(product);
        processedProductImages = [];
        document.getElementById('add-product-form').reset();
        document.getElementById('image-preview').innerHTML = '';

        showPage('my-store');
    } catch (err) {
        console.error(err);
        alert('Erro ao publicar');
    } finally {
        hideLoading();
    }
}

// --- UTILS ---

function showLoading(msg = 'Carregando...') {
    if (loadingText) loadingText.textContent = msg;
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

function showAlert(id, msg, type) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = msg;
        el.className = `alert alert-${type}`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
    }
}

// --- LOADERS ADICIONAIS --- (WITH FIX)

async function loadUserStore() {
    if (!currentUser) {
        currentStore = null;
        updateStoreUI();
        return;
    }
    try {
        const snap = await db.collection('stores').where('ownerId', '==', currentUser.uid).limit(1).get();
        if (!snap.empty) {
            currentStore = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } else {
            currentStore = null;
        }
        updateStoreUI(); // ALWAYS call to update state
    } catch (e) {
        console.error(e);
        // Ensure UI isn't broken
        currentStore = null;
        updateStoreUI();
    }
}

function updateStoreUI() {
    const notCreatedEl = document.getElementById('store-not-created');
    const createdEl = document.getElementById('store-created');

    if (currentStore) {
        notCreatedEl.classList.add('hidden');
        createdEl.classList.remove('hidden');
        document.getElementById('store-name').innerHTML = `${currentStore.name} <span style="font-size:0.8rem; background:#e8f5e9; color:var(--primary-color); padding:4px 8px; border-radius:12px;">Ativo</span>`;
        document.getElementById('store-description').textContent = currentStore.description;
        document.getElementById('store-phone').textContent = currentStore.phone;
        const logoImg = document.getElementById('store-logo-img');
        if (logoImg) logoImg.src = currentStore.logoUrl || 'https://via.placeholder.com/80';

        loadStoreProducts();
    } else {
        notCreatedEl.classList.remove('hidden');
        createdEl.classList.add('hidden');
    }
}

async function loadStoreProducts() {
    const container = document.getElementById('my-products-list');
    container.innerHTML = renderProductSkeleton(3);
    try {
        const snap = await db.collection('products')
            .where('storeId', '==', currentStore.id)
            .orderBy('createdAt', 'desc')
            .get();
        container.innerHTML = '';
        snap.forEach(doc => renderProduct(doc, container, true));
    } catch (e) {
        // Fallback for no index
        const snap = await db.collection('products')
            .where('storeId', '==', currentStore.id)
            .get();
        container.innerHTML = '';
        snap.forEach(doc => renderProduct(doc, container, true));
    }
}

async function deleteProduct(id) {
    if (confirm('Excluir este produto?')) {
        showLoading('Excluindo...');
        await db.collection('products').doc(id).delete();
        await loadStoreProducts();
        hideLoading();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    showLoading();
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
        alert('Erro no login: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    const name = document.getElementById('register-name').value;

    showLoading();
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: name });
        await db.collection('users').doc(cred.user.uid).set({
            name, email, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showPage('home');
    } catch (err) {
        alert('Erro: ' + err.message);
    } finally {
        hideLoading();
    }
}

function openWhatsApp(phone, product) {
    if (!phone) return alert('Sem telefone cadastrado');
    const num = phone.replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá, vi seu produto "${product}" no App e tenho interesse!`);
    window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
}

// SETUP LISTENERS
function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('show-register').onclick = () => showPage('register');
    document.getElementById('show-login').onclick = () => showPage('login');
    document.getElementById('user-avatar').onclick = () => {
        if (currentUser && confirm('Deseja sair?')) {
            auth.signOut();
        } else if (!currentUser) {
            showPage('login');
        }
    }
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = function () {
            this.closest('.modal').classList.remove('active');
        }
    });

    const createStoreBtn = document.getElementById('create-store-btn');
    if (createStoreBtn) {
        createStoreBtn.onclick = () => {
            console.log("Create Store Click");
            document.getElementById('store-modal').classList.add('active');
        }
    } else {
        console.error("Button element missing");
    }

    document.getElementById('store-form').addEventListener('submit', handleStoreSave);
    document.getElementById('add-product-form').addEventListener('submit', handleProductSave);
    setupImageUploads();
    setupSearch();
}

