import { useEffect, useMemo, useState } from 'react'
import './App.css'

const defaultApiBase = () => {
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000';
  }
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    return 'http://127.0.0.1:3000';
  }
  return window.location.origin;
};

const API_BASE = import.meta.env.VITE_API_URL || window.API_BASE_URL || defaultApiBase();

const defaultProducts = [
  {
    id: 1,
    badge: 'Best seller',
    featured: true,
    name: 'AURA Runner',
    subtitle: 'Lightweight road trainer',
    description: 'Fast, breathable, and responsive for longer miles or daily city runs.',
    category: 'Running',
    price: 129,
    image:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 2,
    badge: 'New arrival',
    featured: true,
    name: 'NOIR Classic',
    subtitle: 'Modern everyday wear',
    description: 'Clean design with plush cushioning for a premium streetwear look.',
    category: 'Lifestyle',
    price: 199,
    image:
      'https://images.unsplash.com/photo-1528701800489-20be3c1ea9d7?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 3,
    badge: 'Lightweight',
    featured: false,
    name: 'STUDIO Motion',
    subtitle: 'Performance street sneaker',
    description: 'Designed for dynamic movement with a breathable upper and strong grip.',
    category: 'Performance',
    price: 159,
    image:
      'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 4,
    badge: 'Limited edition',
    featured: false,
    name: 'PAP-JOY Signature',
    subtitle: 'Premium lifestyle silhouette',
    description: 'A bold statement shoe with luxurious materials and subtle details.',
    category: 'Signature',
    price: 249,
    image:
      'https://images.unsplash.com/photo-1520256862855-398228c41684?auto=format&fit=crop&w=900&q=80',
  },
]

const categories = ['All', 'Running', 'Lifestyle', 'Performance', 'Signature']
const sortOptions = ['Featured', 'Price: low to high', 'Price: high to low']

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function App() {
  const [cart, setCart] = useState({})
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortOption, setSortOption] = useState('Featured')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState('shop')
  const [orders, setOrders] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [webhookStatus, setWebhookStatus] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [invoicePage, setInvoicePage] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookError, setWebhookError] = useState('')
  const [orderSaved, setOrderSaved] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [products, setProducts] = useState(defaultProducts)
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')

  const featuredProducts = products.filter((product) => product.featured)

  const productsToShow = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    const filtered = products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'All' || product.category === selectedCategory
      const matchesSearch =
        normalizedSearch === '' ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.subtitle.toLowerCase().includes(normalizedSearch)
      return matchesCategory && matchesSearch
    })

    if (sortOption === 'Price: low to high') {
      return [...filtered].sort((a, b) => a.price - b.price)
    }
    if (sortOption === 'Price: high to low') {
      return [...filtered].sort((a, b) => b.price - a.price)
    }
    return [...filtered].sort((a, b) => (b.featured === a.featured ? 0 : b.featured ? 1 : -1))
  }, [selectedCategory, searchTerm, sortOption])

  useEffect(() => {
    const savedCart = localStorage.getItem('papjoy-cart')
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart))
      } catch (error) {
        console.warn('Unable to parse cart from localStorage', error)
      }
    }
    setInitialized(true)
    fetchProducts()
  }, [])

  useEffect(() => {
    if (!initialized) return
    localStorage.setItem('papjoy-cart', JSON.stringify(cart))
  }, [cart, initialized])

  const fetchProducts = async () => {
    setProductsLoading(true)
    setProductsError('')
    try {
      const response = await fetch(`${API_BASE}/api/v1/products`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to fetch products from backend.')
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Backend returned no products. Showing default collection.')
      }

      setProducts(data)
    } catch (error) {
      setProductsError(error.message)
      setProducts(defaultProducts)
    } finally {
      setProductsLoading(false)
    }
  }

  const items = useMemo(() => Object.values(cart), [cart])
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const freeShippingTarget = 150
  const isFreeShipping = subtotal >= freeShippingTarget
  const amountUntilFreeShipping = Math.max(0, freeShippingTarget - subtotal)
  const shipping = subtotal > 0 ? (isFreeShipping ? 0 : 12) : 0
  const tax = subtotal * 0.08
  const total = subtotal + shipping + tax
  const shippingMessage = subtotal === 0
    ? 'Add items to unlock shipping options.'
    : isFreeShipping
    ? 'You qualify for free shipping.'
    : `Add ${currency.format(amountUntilFreeShipping)} more to waive shipping.`

  const clearCartAfterSuccess = () => {
    setCart({})
    localStorage.removeItem('papjoy-cart')
  }

  const openProductDetail = (product) => {
    setSelectedProduct(product)
  }

  const closeProductDetail = () => {
    setSelectedProduct(null)
  }

  const addToCart = (product) => {
    setCart((current) => {
      const existing = current[product.id]
      return {
        ...current,
        [product.id]: {
          ...product,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      }
    })
    setMessage('')
  }

  const updateQuantity = (productId, delta) => {
    setCart((current) => {
      const entry = current[productId]
      if (!entry) return current
      const quantity = entry.quantity + delta
      if (quantity < 1) {
        const next = { ...current }
        delete next[productId]
        return next
      }
      return {
        ...current,
        [productId]: { ...entry, quantity },
      }
    })
  }

  const removeFromCart = (productId) => {
    setCart((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
  }

  const clearUrlParams = () => {
    const url = new URL(window.location.href)
    url.search = ''
    window.history.replaceState({}, '', url.toString())
  }

  const fetchOrders = async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const response = await fetch(`${API_BASE}/api/v1/orders`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to fetch order history.')
      }

      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      setHistoryError(error.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchWebhookStatus = async () => {
    setWebhookLoading(true)
    setWebhookError('')
    try {
      const response = await fetch(`${API_BASE}/api/v1/webhook-status`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to fetch webhook status.')
      }

      setWebhookStatus(data.webhookStatus || null)
    } catch (error) {
      setWebhookError(error.message)
    } finally {
      setWebhookLoading(false)
    }
  }

  const saveStripeOrder = async (sessionId, itemsToSave) => {
    if (!sessionId) return
    setProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/payments/stripe/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, items: itemsToSave }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save Stripe order.')
      }
      setMessage('Your Stripe payment succeeded. Thank you!')
      setOrderSaved(true)
      clearCartAfterSuccess()
      clearUrlParams()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setProcessing(false)
    }
  }

  const capturePaypalOrder = async (orderId, itemsToSave) => {
    if (!orderId) return
    setProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/payments/paypal/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, items: itemsToSave }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to capture PayPal order.')
      }
      setMessage('Your PayPal payment succeeded. Thank you!')
      setOrderSaved(true)
      clearCartAfterSuccess()
      clearUrlParams()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setProcessing(false)
    }
  }

  useEffect(() => {
    if (!initialized || orderSaved) return

    const params = new URLSearchParams(window.location.search)
    const stripeSessionId = params.get('session_id')
    const paypalOrderId = params.get('token') || params.get('orderId')
    const currentItems = Object.values(cart)

    if (stripeSessionId && currentItems.length > 0) {
      saveStripeOrder(stripeSessionId, currentItems)
    } else if (paypalOrderId && currentItems.length > 0) {
      capturePaypalOrder(paypalOrderId, currentItems)
    }
  }, [initialized, orderSaved, cart])

  const getOrderInvoice = (order) => {
    const itemSubtotal = (order.products || []).reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    )
    const shipping = itemSubtotal > 0 ? (itemSubtotal >= 150 ? 0 : 12) : 0
    const tax = itemSubtotal * 0.08
    return {
      itemSubtotal,
      shipping,
      tax,
      total: itemSubtotal + shipping + tax,
    }
  }

  useEffect(() => {
    if (page === 'history') {
      fetchOrders()
      fetchWebhookStatus()
      const poll = setInterval(() => {
        fetchWebhookStatus()
      }, 10000)
      return () => clearInterval(poll)
    }
    return undefined
  }, [page, orderSaved])

  const openOrderDetails = (order) => {
    setSelectedOrder(order)
    setInvoicePage(false)
  }

  const openOrderInvoice = (order) => {
    setSelectedOrder(order)
    setInvoicePage(true)
    setPage('history')
  }

  const closeOrderDetails = () => {
    setSelectedOrder(null)
    setInvoicePage(false)
  }

  const handleStripeCheckout = async () => {
    if (items.length === 0) {
      setMessage('Add something to the cart before checkout.')
      return
    }

    setProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/payments/stripe/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to start Stripe checkout.')
      }
      window.location.href = data.url
    } catch (error) {
      setMessage(error.message)
      setProcessing(false)
    }
  }

  const handlePaypalCheckout = async () => {
    if (items.length === 0) {
      setMessage('Add something to the cart before checkout.')
      return
    }

    setProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/payments/paypal/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to start PayPal checkout.')
      }
      window.location.href = data.approvalUrl
    } catch (error) {
      setMessage(error.message)
      setProcessing(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PAPJOY</p>
          <h1>Shoes that move with life.</h1>
        </div>
        <div className="cart-summary">
          <span>{totalQuantity} items</span>
          <strong>{currency.format(total)}</strong>
        </div>
      </header>

      <div className="page-nav">
        <button
          type="button"
          className={page === 'shop' ? 'nav-pill active' : 'nav-pill'}
          onClick={() => setPage('shop')}
        >
          Shop
        </button>
        <button
          type="button"
          className={page === 'history' ? 'nav-pill active' : 'nav-pill'}
          onClick={() => setPage('history')}
        >
          Order history
        </button>
      </div>

      <main className={page === 'history' || invoicePage ? 'history-layout' : 'store-layout'}>
        {page === 'history' || invoicePage ? (
          <section className="history-panel">
            <div className="history-header">
              <div>
                <p className="eyebrow">Order history</p>
                <h2>Paid orders from PAPJOY</h2>
                <p>Review completed purchases and verify payment details with Stripe.</p>
              </div>
              <button
                type="button"
                className="nav-pill secondary"
                onClick={() => setPage('shop')}
              >
                Back to shop
              </button>
            </div>

            <div className="webhook-status-card">
              <p className="eyebrow">Stripe webhook status</p>
              {webhookLoading ? (
                <strong>Checking webhook status…</strong>
              ) : webhookError ? (
                <strong className="webhook-error">{webhookError}</strong>
              ) : webhookStatus ? (
                <div className="webhook-values">
                  <div>
                    <span>Last event</span>
                    <strong>{webhookStatus.lastEvent || 'No events yet'}</strong>
                  </div>
                  <div>
                    <span>Received</span>
                    <strong>
                      {webhookStatus.lastReceivedAt
                        ? new Date(webhookStatus.lastReceivedAt).toLocaleString()
                        : 'Never'}
                    </strong>
                  </div>
                  <div>
                    <span>Deliveries</span>
                    <strong>{webhookStatus.count}</strong>
                  </div>
                </div>
              ) : (
                <strong>No webhook data available.</strong>
              )}
            </div>

            {selectedOrder && !invoicePage ? (
              <section className="order-detail-panel">
                <div className="order-detail-header">
                  <div>
                    <p className="eyebrow">Order details</p>
                    <h2>Order {selectedOrder.paymentId || selectedOrder.id}</h2>
                    <p>{selectedOrder.provider} · {selectedOrder.status}</p>
                  </div>
                  <div className="detail-actions">
                    <button type="button" className="nav-pill secondary" onClick={closeOrderDetails}>
                      Back to history
                    </button>
                    <button type="button" className="nav-pill" onClick={() => openOrderInvoice(selectedOrder)}>
                      View invoice
                    </button>
                  </div>
                </div>

                <div className="order-detail-grid">
                  <div className="order-detail-block">
                    <span>Order date</span>
                    <strong>{new Date(selectedOrder.createdAt).toLocaleString()}</strong>
                  </div>
                  <div className="order-detail-block">
                    <span>Payment ID</span>
                    <strong>{selectedOrder.paymentId || selectedOrder.id}</strong>
                  </div>
                  <div className="order-detail-block">
                    <span>Order source</span>
                    <strong>{selectedOrder.provider}</strong>
                  </div>
                </div>

                <div className="order-items expanded">
                  <h3>Purchased items</h3>
                  {selectedOrder.products && selectedOrder.products.length > 0 ? (
                    selectedOrder.products.map((item, index) => (
                      <div key={index} className="order-item detail-row">
                        <span>{item.name} × {item.quantity || 1}</span>
                        <strong>{currency.format((item.price || 0) * (item.quantity || 1))}</strong>
                      </div>
                    ))
                  ) : (
                    <p>No item details available.</p>
                  )}
                </div>

                <div className="invoice-summary-card">
                  <h3>Invoice summary</h3>
                  {(() => {
                    const invoice = getOrderInvoice(selectedOrder)
                    return (
                      <div className="invoice-breakdown">
                        <div>
                          <span>Items subtotal</span>
                          <strong>{currency.format(invoice.itemSubtotal)}</strong>
                        </div>
                        <div>
                          <span>Shipping</span>
                          <strong>{invoice.shipping === 0 ? 'Free' : currency.format(invoice.shipping)}</strong>
                        </div>
                        <div>
                          <span>Tax</span>
                          <strong>{currency.format(invoice.tax)}</strong>
                        </div>
                        <div className="total-row">
                          <span>Total</span>
                          <strong>{currency.format(invoice.total)}</strong>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </section>
            ) : selectedOrder && invoicePage ? (
              <section className="invoice-panel">
                <div className="order-detail-header">
                  <div>
                    <p className="eyebrow">Invoice</p>
                    <h2>Invoice #{selectedOrder.paymentId || selectedOrder.id}</h2>
                    <p>{selectedOrder.provider} · {selectedOrder.status}</p>
                  </div>
                  <div className="detail-actions">
                    <button type="button" className="nav-pill secondary" onClick={closeOrderDetails}>
                      Back to history
                    </button>
                  </div>
                </div>

                <div className="invoice-box">
                  <div className="invoice-top">
                    <div>
                      <p className="eyebrow">Billed to</p>
                      <h3>PAPJOY Customer</h3>
                      <p>c/o PAPJOY store</p>
                    </div>
                    <div>
                      <p className="eyebrow">Invoice details</p>
                      <p>Invoice #: {selectedOrder.paymentId || selectedOrder.id}</p>
                      <p>Date: {new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="order-items expanded invoice-table">
                    <div className="invoice-table-header">
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Price</span>
                      <span>Total</span>
                    </div>
                    {selectedOrder.products && selectedOrder.products.length > 0 ? (
                      selectedOrder.products.map((item, index) => (
                        <div key={index} className="invoice-item-row">
                          <span>{item.name}</span>
                          <span>{item.quantity || 1}</span>
                          <span>{currency.format(item.price || 0)}</span>
                          <strong>{currency.format((item.price || 0) * (item.quantity || 1))}</strong>
                        </div>
                      ))
                    ) : (
                      <p>No item details available.</p>
                    )}
                  </div>

                  {(() => {
                    const invoice = getOrderInvoice(selectedOrder)
                    return (
                      <div className="invoice-summary-card">
                        <div>
                          <span>Items subtotal</span>
                          <strong>{currency.format(invoice.itemSubtotal)}</strong>
                        </div>
                        <div>
                          <span>Shipping</span>
                          <strong>{invoice.shipping === 0 ? 'Free' : currency.format(invoice.shipping)}</strong>
                        </div>
                        <div>
                          <span>Tax</span>
                          <strong>{currency.format(invoice.tax)}</strong>
                        </div>
                        <div className="total-row">
                          <span>Grand total</span>
                          <strong>{currency.format(invoice.total)}</strong>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </section>
            ) : historyLoading ? (
              <div className="empty-grid-message">Loading order history…</div>
            ) : historyError ? (
              <div className="empty-grid-message">{historyError}</div>
            ) : orders.length === 0 ? (
              <div className="empty-grid-message">
                No paid orders yet. Complete a checkout to see your order history here.
              </div>
            ) : (
              <div className="order-list">
                {orders.map((order) => (
                  <article key={order.id} className="order-card">
                    <div className="order-meta">
                      <div>
                        <p className="eyebrow">{order.provider}</p>
                        <h3>{order.status}</h3>
                        <p className="order-count">{order.products?.length || 0} items</p>
                      </div>
                      <div className="order-total">{currency.format(order.amount || 0)}</div>
                    </div>

                    <div className="order-row">
                      <span>Order ID</span>
                      <strong>{order.paymentId || order.id}</strong>
                    </div>
                    <div className="order-row">
                      <span>Date</span>
                      <strong>{new Date(order.createdAt).toLocaleString()}</strong>
                    </div>
                    <button
                      type="button"
                      className="detail-toggle"
                      onClick={() => openOrderDetails(order)}
                    >
                      View details
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">Premium footwear</p>
                <h2>Step into every day with confidence.</h2>
                <p>
                  Discover PAPJOY's curated sneaker collection, built for style,
                  comfort, and lasting performance.
                </p>
                <div className="hero-actions">
                  <button type="button" onClick={() => setMessage('')}>
                    Explore collection
                  </button>
                  <span className="hero-badge">Free shipping on orders over $150</span>
                </div>
              </div>
              <div className="hero-stats">
                <article>
                  <span>4.9/5</span>
                  <p>Customer rating</p>
                </article>
                <article>
                  <span>24</span>
                  <p>Fast delivery cities</p>
                </article>
                <article>
                  <span>Exclusive</span>
                  <p>Drop releases weekly</p>
                </article>
              </div>
            </section>

            <section className="products-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Featured drops</p>
                  <h2>Shop PAPJOY collection</h2>
                </div>
                <div className="filter-bar">
                  <div className="category-pill-group">
                    {categories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={category === selectedCategory ? 'pill active' : 'pill'}
                        onClick={() => setSelectedCategory(category)}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  <div className="sort-panel">
                    <label htmlFor="sort">Sort by</label>
                    <select
                      id="sort"
                      value={sortOption}
                      onChange={(event) => setSortOption(event.target.value)}
                    >
                      {sortOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search styles"
                    className="product-search"
                  />
                </div>
              </div>
              {productsLoading ? (
                <div className="empty-grid-message">Loading products from backend…</div>
              ) : productsError ? (
                <div className="empty-grid-message">{productsError}</div>
              ) : null}

              {featuredProducts.length > 0 ? (
                <div className="highlight-row">
                  {featuredProducts.map((product) => (
                    <article key={product.id} className="highlight-card">
                      <img src={product.image} alt={product.name} />
                      <div>
                        <p className="eyebrow">{product.badge}</p>
                        <h3>{product.name}</h3>
                        <p>{currency.format(product.price)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="product-grid">
                {productsToShow.length === 0 ? (
                  <div className="empty-grid-message">
                    No products match this filter. Try a different category or search term.
                  </div>
                ) : (
                  productsToShow.map((product) => (
                    <article key={product.id} className="product-card">
                      <img src={product.image} alt={product.name} />
                      <div className="product-info">
                        <div>
                          <p className="product-tag">{product.badge}</p>
                          <p className="eyebrow">{product.name}</p>
                          <h3>{product.subtitle}</h3>
                        </div>
                        <div className="product-footer">
                          <strong>{currency.format(product.price)}</strong>
                          <div className="product-actions">
                            <button type="button" onClick={() => addToCart(product)}>
                              Add to cart
                            </button>
                            <button type="button" className="detail-button" onClick={() => openProductDetail(product)}>
                              View details
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <aside className="cart-panel">
              <div className="cart-header">
                <p className="eyebrow">Your cart</p>
                <h2>Ready to checkout</h2>
              </div>

              {items.length === 0 ? (
                <div className="empty-cart">
                  <p>Your cart is empty. Add a pair to see it here.</p>
                </div>
              ) : (
                <div className="cart-items">
                  {items.map((item) => (
                    <div key={item.id} className="cart-item">
                      <div>
                        <h3>{item.name}</h3>
                        <p>{currency.format(item.price)}</p>
                      </div>
                      <div className="cart-controls">
                        <button type="button" onClick={() => updateQuantity(item.id, -1)}>
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.id, 1)}>
                          +
                        </button>
                        <button type="button" className="remove" onClick={() => removeFromCart(item.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cart-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{currency.format(subtotal)}</strong>
                </div>
                <div>
                  <span>Shipping</span>
                  <strong>{shipping === 0 ? 'Free' : currency.format(shipping)}</strong>
                </div>
                <div>
                  <span>Tax</span>
                  <strong>{currency.format(tax)}</strong>
                </div>
                <div className="total-row">
                  <span>Total</span>
                  <strong>{currency.format(total)}</strong>
                </div>
                <div className="shipping-message">{shippingMessage}</div>
                <div className="quick-checkout-note">
                  Check out faster on mobile with a one-tap payment bar.
                </div>
              </div>

              <div className="payment-actions">
                <button
                  className="stripe-button"
                  type="button"
                  disabled={items.length === 0 || processing}
                  onClick={handleStripeCheckout}
                >
                  {processing ? 'Redirecting...' : 'Pay with Stripe'}
                </button>
                <button
                  className="paypal-button"
                  type="button"
                  disabled={items.length === 0 || processing}
                  onClick={handlePaypalCheckout}
                >
                  {processing ? 'Opening PayPal...' : 'Pay with PayPal'}
                </button>
              </div>

              {message ? <p className="notice">{message}</p> : null}
            </aside>
          </>
        )}
      </main>

      {items.length > 0 && page === 'shop' ? (
        <div className="mobile-checkout-bar">
          <div>
            <p>Quick checkout</p>
            <span>{currency.format(total)} total</span>
          </div>
          <div className="mobile-actions">
            <button
              type="button"
              className="stripe-button mobile"
              onClick={handleStripeCheckout}
              disabled={processing}
            >
              Stripe
            </button>
            <button
              type="button"
              className="paypal-button mobile"
              onClick={handlePaypalCheckout}
              disabled={processing}
            >
              PayPal
            </button>
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="modal-backdrop" onClick={closeProductDetail}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="close-modal" onClick={closeProductDetail}>
              ×
            </button>
            <img src={selectedProduct.image} alt={selectedProduct.name} />
            <div className="modal-copy">
              <p className="eyebrow">{selectedProduct.category}</p>
              <h2>{selectedProduct.name}</h2>
              <p className="product-subtitle">{selectedProduct.subtitle}</p>
              <p className="product-description">{selectedProduct.description}</p>
              <div className="modal-meta">
                <span>{currency.format(selectedProduct.price)}</span>
                <span className="product-badge">{selectedProduct.badge}</span>
              </div>
              <button
                className="add-cart-modal"
                type="button"
                onClick={() => {
                  addToCart(selectedProduct)
                  closeProductDetail()
                }}
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="footer-bar">
        <p>
          PAPJOY is built for energized steps and modern style. Want help wiring
          in a real payment gateway next?
        </p>
      </footer>
    </div>
  )
}

export default App
