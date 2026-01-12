// ========================================
// 설정 영역 - 여기를 수정하세요!
// ========================================
const CONFIG = {
    REDASH_URL: 'https://redash.sikdae.com',  // Redash 서버 URL
    API_KEY: '3YxpesqTXvZtQCPHmVlw2UsFIaOkUrsvCgek0CSv',                   // Redash API Key
    QUERY_ID: '1335',                      // 쿼리 ID
};

// ========================================
// 전역 변수
// ========================================
let allOrders = [];
let filteredOrders = [];
let currentPage = 1;
const itemsPerPage = 50;

// ========================================
// URL 파라미터 처리
// ========================================
function getTemplateNumber() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('number') || '2'; // 기본값 2
}

// ========================================
// Redash API 호출
// ========================================
async function fetchRedashData() {
    const templateNumber = getTemplateNumber();
    const url = `${CONFIG.REDASH_URL}/api/queries/${CONFIG.QUERY_ID}/results`;
    
    try {
        showLoading(true);
        hideError();
        
        // Redash API 호출 (쿼리 파라미터 포함)
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${CONFIG.API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parameters: {
                    number: templateNumber
                },
                max_age: 0  // 캐시 사용 안 함
            })
        });

        if (!response.ok) {
            throw new Error(`API 호출 실패: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // job 방식의 응답 처리
        if (data.job) {
            return await pollJobResult(data.job.id);
        }
        
        // 직접 결과가 온 경우
        if (data.query_result) {
            return data.query_result.data.rows;
        }
        
        throw new Error('예상하지 못한 응답 형식입니다.');
        
    } catch (error) {
        console.error('데이터 로딩 오류:', error);
        showError(`데이터를 불러오는데 실패했습니다: ${error.message}`);
        throw error;
    } finally {
        showLoading(false);
    }
}

// ========================================
// Job 결과 폴링 (Redash가 job 방식일 경우)
// ========================================
async function pollJobResult(jobId) {
    const maxAttempts = 30;
    const pollInterval = 1000; // 1초
    
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const response = await fetch(`${CONFIG.REDASH_URL}/api/jobs/${jobId}`, {
            headers: {
                'Authorization': `Key ${CONFIG.API_KEY}`
            }
        });
        
        const jobData = await response.json();
        
        if (jobData.job.status === 3) { // 완료
            const resultResponse = await fetch(`${CONFIG.REDASH_URL}/api/query_results/${jobData.job.query_result_id}`, {
                headers: {
                    'Authorization': `Key ${CONFIG.API_KEY}`
                }
            });
            
            const resultData = await resultResponse.json();
            return resultData.query_result.data.rows;
        }
        
        if (jobData.job.status === 4) { // 실패
            throw new Error('쿼리 실행 실패');
        }
    }
    
    throw new Error('쿼리 실행 시간 초과');
}

// ========================================
// 데이터 처리 및 표시
// ========================================
async function loadData() {
    try {
        const data = await fetchRedashData();
        allOrders = data;
        filteredOrders = [...allOrders];
        
        updateSummary();
        updateTemplateInfo();
        updateLastUpdateTime();
        applyFilters();
        
    } catch (error) {
        console.error('데이터 로딩 실패:', error);
    }
}

function updateSummary() {
    const statusCounts = {
        total: allOrders.length,
        none: 0,
        selected: 0,
        confirmed: 0,
        delivered: 0
    };
    
    allOrders.forEach(order => {
        const status = order.status;
        if (status === '미선택') statusCounts.none++;
        else if (status === '선택완료') statusCounts.selected++;
        else if (status === '주문확정') statusCounts.confirmed++;
        else if (status === '배송완료') statusCounts.delivered++;
    });
    
    document.getElementById('totalCount').textContent = statusCounts.total;
    document.getElementById('noneCount').textContent = statusCounts.none;
    document.getElementById('selectedCount').textContent = statusCounts.selected;
    document.getElementById('confirmedCount').textContent = statusCounts.confirmed;
    document.getElementById('deliveredCount').textContent = statusCounts.delivered;
}

function updateTemplateInfo() {
    const templateNumber = getTemplateNumber();
    document.getElementById('templateNumber').textContent = templateNumber;
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = timeString;
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    
    filteredOrders = allOrders.filter(order => {
        const matchesSearch = !searchTerm || 
            order.receiverName.toLowerCase().includes(searchTerm) ||
            order.receiverPhone.toLowerCase().includes(searchTerm) ||
            order.productName.toLowerCase().includes(searchTerm) ||
            (order.productCode && order.productCode.toLowerCase().includes(searchTerm));
        
        const matchesStatus = !statusFilter || order.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });
    
    currentPage = 1;
    renderTable();
    renderPagination();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageOrders = filteredOrders.slice(startIndex, endIndex);
    
    if (pageOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #6c757d;">
                    ${filteredOrders.length === 0 ? '조회된 데이터가 없습니다.' : '해당 페이지에 데이터가 없습니다.'}
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = pageOrders.map((order, index) => `
        <tr>
            <td>${startIndex + index + 1}</td>
            <td>${order.productCode || '-'}</td>
            <td>${order.productName || '-'}</td>
            <td>
                ${order.thumbnailImageUrl 
                    ? `<img src="${order.thumbnailImageUrl}" alt="상품이미지" class="product-image" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/><text fill=%22%23999%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22>No Image</text></svg>'">` 
                    : '<span style="color: #999;">-</span>'}
            </td>
            <td>${order.receiverName || '-'}</td>
            <td>${order.receiverPhone || '-'}</td>
            <td><span class="status-badge status-${order.status}">${order.status}</span></td>
        </tr>
    `).join('');
}

function renderPagination() {
    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // 이전 버튼
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">이전</button>`;
    
    // 페이지 번호
    const maxButtons = 10;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (startPage > 2) html += `<button disabled>...</button>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<button disabled>...</button>`;
        html += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }
    
    // 다음 버튼
    html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">다음</button>`;
    
    pagination.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    renderTable();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================================
// UI 헬퍼 함수
// ========================================
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

// ========================================
// 이벤트 리스너
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // 초기 데이터 로드
    loadData();
    
    // 검색 필터
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    
    // 새로고침 버튼
    document.getElementById('refreshBtn').addEventListener('click', loadData);
});
