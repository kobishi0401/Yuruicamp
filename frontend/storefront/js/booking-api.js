// ========================================
// BookingAPI — 預約前台 Mock／Backend facade
// ========================================

(function (global) {
  'use strict';

  var MOCK_BOOKINGS_KEY = 'mockBookings';
  var MOCK_CLOSURES_KEY = 'mockCampgroundClosures';
  var MOCK_HOLD_MS = 15 * 60 * 1000;

  // 頁面只呼叫 BookingAPI；此開關決定讀 JSON 或 Spring Boot。
  function useMockApi() {
    return !(global.AppConfig && global.AppConfig.USE_MOCK_API === false);
  }

  function path(key) {
    var table = global.MockDataPaths;
    return table && table[key] ? table[key] : '';
  }

  function readStorage(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /** Mock JSON 用原生 fetch；真後端 REST 一律走 ApiClient（帶 AppAuth token） */
  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) {
        throw new Error('Fetch failed: ' + url);
      }

      return response.json();
    });
  }

  function restRequest(restPath, options) {
    if (!global.ApiClient || typeof global.ApiClient._restRequest !== 'function') {
      return Promise.reject(new Error('ApiClient not loaded'));
    }

    return global.ApiClient._restRequest(restPath, options || { auth: 'optional' });
  }

  function numberValue(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  // Backend 公開契約較精簡，這裡補成既有 Booking 頁面需要的顯示形狀。
  function normalizeZone(zone) {
    return {
      zoneId: zone.zoneId || zone.id,
      type: zone.type || '',
      capacityPerSite: Number(zone.capacityPerSite) || 0,
      priceWeekday: numberValue(zone.priceWeekday),
      priceHoliday: numberValue(zone.priceHoliday),
      totalSites: Number(zone.totalSites) || 0,
      active: zone.active !== false,
    };
  }

  function normalizeCampground(campground) {
    var id = campground.campgroundId || campground.id;

    return Object.assign({}, campground, {
      id: id,
      campgroundId: id,
      environmentTags: Array.isArray(campground.environmentTags) ? campground.environmentTags : [],
      facilityTags: Array.isArray(campground.facilityTags) ? campground.facilityTags : [],
      images: Array.isArray(campground.images) ? campground.images : [],
      zones: Array.isArray(campground.zones) ? campground.zones.map(normalizeZone) : [],
    });
  }

  // Backend 不公開租借即時數量；真正庫存會在建立 Checkout 時鎖定重查。
  function normalizeEquipment(item) {
    if (item.rentalListingId || item.pricing) {
      return item;
    }

    return {
      equipmentId: item.id,
      rentalListingId: item.id,
      rentalSkuVariantId: item.rentalSkuVariantId,
      variantId: item.rentalSkuVariantId,
      campgroundId: item.campgroundId,
      name: item.name,
      sku: item.rentalSkuVariantId,
      specLabel: '',
      imageUrl: '',
      terrainTag: '',
      description: '實際可租數量將在建立預約時由後端確認。',
      pricing: {
        pricePerDayWeekday: numberValue(item.pricePerDayWeekday),
        pricePerDayHoliday: numberValue(item.pricePerDayHoliday),
        discount: 0,
      },
      stock: null,
    };
  }

  // 公開 API 使用 closureType／weekday，既有月曆 ViewModel 使用 type／dayOfWeek。
  function normalizeClosure(closure) {
    return Object.assign({}, closure, {
      type: closure.type || closure.closureType,
      dayOfWeek: closure.dayOfWeek == null ? closure.weekday : closure.dayOfWeek,
    });
  }

  // 會員中心仍使用既有顯示模型，資料內容則完全取自 Backend 快照。
  function normalizeBooking(booking) {
    if (booking.bookingInfo) {
      return booking;
    }

    var pricing = booking.pricing || {};
    var finalAmount = pricing.finalAmount != null ? pricing.finalAmount : booking.finalAmount;

    return Object.assign({}, booking, {
      id: booking.bookingId,
      bookingId: booking.bookingId,
      submittedAt: booking.createdAt,
      payment: booking.paymentMethod,
      bookingInfo: {
        campgroundId: booking.campgroundId,
        campgroundName: booking.campgroundName,
        region: booking.region,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalDays: Number(booking.weekdayCount || 0) + Number(booking.holidayCount || 0),
        weekdayCount: Number(booking.weekdayCount || 0),
        holidayCount: Number(booking.holidayCount || 0),
        guestCount: booking.guestCount,
      },
      selectedZones: (booking.zones || []).map(function (zone) {
        return {
          zoneId: zone.zoneId,
          zoneType: zone.type,
          quantity: zone.quantity,
          subtotal: numberValue(zone.lineTotal),
        };
      }),
      selectedRentals: (booking.rentals || []).map(function (rental) {
        return {
          rentalListingId: rental.rentalListingId,
          rentalSkuVariantId: rental.rentalSkuVariantId,
          variantId: rental.rentalSkuVariantId,
          sku: rental.sku,
          name: rental.name,
          specLabel: rental.specification || '',
          quantity: rental.quantity,
          subtotal: numberValue(rental.lineTotal),
        };
      }),
      summary: {
        zoneTotal: numberValue(pricing.zoneTotal),
        rentalTotal: numberValue(pricing.rentalTotal),
        appliedDiscount: numberValue(pricing.discount),
        finalAmount: numberValue(finalAmount),
      },
    });
  }

  function buildMockMeta(page, size, totalElements) {
    return {
      page: page,
      size: size,
      totalElements: totalElements,
      totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size),
    };
  }

  function loadMockBookings() {
    return fetchJson(path('campBookings')).then(function (seed) {
      return (Array.isArray(seed) ? seed : []).concat(readStorage(MOCK_BOOKINGS_KEY, []));
    });
  }

  function getMaxBookingId(list) {
    return (list || []).reduce(function (maximum, booking) {
      var number = Number(booking && (booking.id || booking.bookingId));
      return Number.isFinite(number) ? Math.max(maximum, number) : maximum;
    }, 0);
  }

  function createMockBooking(request, cart) {
    return loadMockBookings().then(function (all) {
      var id = getMaxBookingId(all) + 1;
      var source = cart || {};
      var info = source.bookingInfo || {};
      var summary = source.summary || {};
      var expiresAt = new Date(Date.now() + MOCK_HOLD_MS).toISOString();
      var booking = {
        id: id,
        bookingId: String(id),
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: request.paymentMethod,
        checkoutExpiresAt: expiresAt,
        checkoutStep: 'ready_to_pay',
        bookingInfo: info,
        selectedZones: source.selectedZones || [],
        selectedRentals: source.selectedRentals || [],
        summary: summary,
        pricing: {
          zoneTotal: numberValue(summary.zoneTotal).toFixed(2),
          rentalTotal: numberValue(summary.rentalTotal).toFixed(2),
          discount: numberValue(summary.appliedDiscount).toFixed(2),
          finalAmount: numberValue(summary.finalAmount).toFixed(2),
        },
      };
      var stored = readStorage(MOCK_BOOKINGS_KEY, []);

      stored.push(booking);
      writeStorage(MOCK_BOOKINGS_KEY, stored);

      return booking;
    });
  }

  function loadAvailabilityContext() {
    var availability = global.BookingAvailability;
    if (!availability) {
      return Promise.reject(new Error('BookingAvailability not loaded'));
    }

    // Backend 模式一律呼叫 check-availability，不下載預約與停售資料到瀏覽器計算。
    if (!useMockApi()) {
      return Promise.resolve(null);
    }

    return Promise.all([
      BookingAPI.getCampgrounds(),
      BookingAPI.getBookings(),
      fetchJson(path('zoneBlocks')).catch(function () {
        return [];
      }),
      BookingAPI.getPolicy(),
      BookingAPI.getClosures(),
    ]).then(function (results) {
      return availability.buildContext(results[0], results[1], results[2], results[3], null, results[4]);
    });
  }

  var BookingAPI = {
    isMockMode: useMockApi,

    getCampgrounds: function (filters) {
      var promise;
      if (useMockApi()) {
        promise = fetchJson(path('campgrounds')).then(function (list) {
          return list.map(normalizeCampground);
        });
      } else {
        promise = restRequest('/booking/campgrounds', {
          auth: 'none',
        }).then(function (list) {
          // 列表契約刻意省略 zones；前台卡片需要價格，因此補抓每筆詳情。
          return Promise.all(
            (list || []).map(function (item) {
              return BookingAPI.getCampgroundById(item.id);
            })
          );
        });
      }

      return promise.then(function (list) {
        if (!filters) {
          return list;
        }

        return list.filter(function (campground) {
          return !filters.region || campground.region === filters.region;
        });
      });
    },

    getCampgroundById: function (campgroundId) {
      if (!useMockApi()) {
        return restRequest('/booking/campgrounds/' + encodeURIComponent(campgroundId), {
          auth: 'none',
        }).then(normalizeCampground);
      }

      return fetchJson(path('campgrounds')).then(function (list) {
        var item = list.find(function (campground) {
          return campground.campgroundId === campgroundId;
        });
        if (!item) {
          throw new Error('Campground not found');
        }

        return normalizeCampground(item);
      });
    },

    getEquipment: function (campgroundId) {
      var promise = useMockApi()
        ? fetchJson(path('campEquipment'))
        : restRequest('/booking/equipment?campgroundId=' + encodeURIComponent(campgroundId), {
            auth: 'none',
          });

      return promise.then(function (list) {
        return (list || []).map(normalizeEquipment).filter(function (item) {
          return item.campgroundId === campgroundId;
        });
      });
    },

    getPolicy: function () {
      var availability = global.BookingAvailability;
      var promise = useMockApi()
        ? fetchJson(path('bookingPolicy'))
        : restRequest('/booking/policy', { auth: 'none' });

      return promise.then(function (policy) {
        return availability ? availability.normalizePolicy(policy) : policy;
      });
    },

    getClosures: function () {
      if (!useMockApi()) {
        return restRequest('/booking/closures', { auth: 'none' }).then(function (list) {
          return (list || []).map(normalizeClosure);
        });
      }

      var merge = global.MockStorageMerge;
      return fetchJson(path('campgroundClosures')).then(function (seed) {
        if (!merge) {
          return (seed || []).map(normalizeClosure);
        }

        var overlay = merge.readJsonStorage(MOCK_CLOSURES_KEY, []);
        return merge.mergeById(seed, overlay, 'id')
          .filter(function (closure) {
            return !closure._deleted;
          })
          .map(normalizeClosure);
      });
    },

    saveClosuresOverlay: function (list) {
      if (!useMockApi()) {
        return Promise.reject(new Error('Backend closure writes require Admin API'));
      }

      writeStorage(MOCK_CLOSURES_KEY, list || []);
      return Promise.resolve(list || []);
    },

    getBookingWindow: function () {
      var availability = global.BookingAvailability;
      return BookingAPI.getPolicy().then(function (policy) {
        return availability ? availability.getBookingWindow(policy) : { minDate: null, maxDate: null };
      });
    },

    getAvailability: function (params) {
      var zones = Array.isArray(params.zones) ? params.zones : [];
      var rentals = Array.isArray(params.rentals) ? params.rentals : [];

      if (!useMockApi()) {
        return restRequest('/booking/check-availability', {
          method: 'POST',
          auth: 'none',
          body: {
            campgroundId: params.campgroundId,
            checkIn: params.checkIn || params.from,
            checkOut: params.checkOut || params.to,
            zones: zones,
            rentals: rentals,
          },
        });
      }

      var availability = global.BookingAvailability;
      if (!availability) {
        return Promise.reject(new Error('BookingAvailability not loaded'));
      }

      return loadAvailabilityContext().then(function (context) {
        var zoneResults = zones.map(function (zone) {
          var availableQuantity = availability.getMinRemainingInRange(
            zone.zoneId,
            params.checkIn || params.from,
            params.checkOut || params.to,
            context
          );

          return {
            zoneId: zone.zoneId,
            requested: zone.quantity,
            availableQuantity: availableQuantity,
          };
        });
        var rentalResults = rentals.map(function (rental) {
          var listingId = rental.rentalListingId;
          var requested = rental.quantity || 1;
          var stockFromMock = params.rentalStockById && params.rentalStockById[listingId];
          var availableQuantity =
            stockFromMock != null && Number.isFinite(Number(stockFromMock))
              ? Number(stockFromMock)
              : requested;
          return {
            rentalListingId: listingId,
            requested: requested,
            availableQuantity: availableQuantity,
          };
        });
        var closed =
          zones.length > 0 &&
          availability.hasClosedNightInRange(
            params.campgroundId,
            params.checkIn || params.from,
            params.checkOut || params.to,
            context
          );
        var zoneUnavailable = zoneResults.some(function (zone) {
          return zone.requested > zone.availableQuantity;
        });
        var rentalUnavailable = rentalResults.some(function (rental) {
          return rental.requested > rental.availableQuantity;
        });
        var reasons = [];

        if (closed) {
          reasons.push('CAMPGROUND_CLOSED');
        }
        if (zoneUnavailable) {
          reasons.push('ZONE_UNAVAILABLE');
        }
        if (rentalUnavailable) {
          reasons.push('RENTAL_UNAVAILABLE');
        }

        return {
          available: reasons.length === 0,
          reasons: reasons,
          zones: zoneResults,
          rentals: rentalResults,
        };
      });
    },

    getMinRemainingForStay: function (zoneId, checkIn, checkOut, campgroundId) {
      var resolvedCampgroundId = campgroundId;
      if (!resolvedCampgroundId && useMockApi()) {
        return loadAvailabilityContext().then(function (context) {
          var zone = context.zonesById[zoneId] || {};
          return BookingAPI.getMinRemainingForStay(zoneId, checkIn, checkOut, zone.campgroundId);
        });
      }

      return BookingAPI.getAvailability({
        campgroundId: resolvedCampgroundId,
        checkIn: checkIn,
        checkOut: checkOut,
        zones: [{ zoneId: zoneId, quantity: 1 }],
      }).then(function (result) {
        return result.zones && result.zones[0] ? result.zones[0].availableQuantity : 0;
      });
    },

    getBookingsPage: function (options) {
      var settings = options || {};
      var page = Math.max(0, Number(settings.page) || 0);
      var size = Math.min(100, Math.max(1, Number(settings.size) || 20));

      if (!useMockApi()) {
        var query = new URLSearchParams({ page: String(page), size: String(size) });
        return restRequest('/booking/bookings?' + query.toString(), {
          auth: 'required',
          includeMeta: true,
        }).then(function (result) {
          return {
            data: (result.data || []).map(normalizeBooking),
            meta: result.meta,
          };
        });
      }

      return loadMockBookings().then(function (all) {
        var filtered = settings.customerId
          ? all.filter(function (booking) {
              return booking.customerId === settings.customerId;
            })
          : all;
        var start = page * size;

        return {
          data: filtered.slice(start, start + size).map(normalizeBooking),
          meta: buildMockMeta(page, size, filtered.length),
        };
      });
    },

    getBookings: function (customerId, options) {
      var settings = Object.assign({}, options || {}, { customerId: customerId });
      return BookingAPI.getBookingsPage(settings).then(function (result) {
        var list = result.data;

        // 既有會員中心仍接收陣列；meta 以非列舉屬性保留給分頁 UI 使用。
        Object.defineProperty(list, 'meta', {
          configurable: true,
          enumerable: false,
          value: result.meta,
        });

        return list;
      });
    },

    getBookingById: function (bookingId) {
      if (!useMockApi()) {
        return restRequest('/booking/bookings/' + encodeURIComponent(bookingId), {
          auth: 'required',
        }).then(normalizeBooking);
      }

      return loadMockBookings().then(function (all) {
        var booking = all.find(function (item) {
          return String(item.id || item.bookingId) === String(bookingId);
        });
        if (!booking) {
          throw new Error('Booking not found');
        }

        return normalizeBooking(booking);
      });
    },

    getCheckoutSession: function (bookingId) {
      if (!useMockApi()) {
        return restRequest('/booking/checkout/sessions/' + encodeURIComponent(bookingId), {
          auth: 'required',
        });
      }

      return BookingAPI.getBookingById(bookingId);
    },

    createBooking: function (request, mockCart) {
      if (!useMockApi()) {
        return restRequest('/booking/checkout/sessions', {
          method: 'POST',
          auth: 'required',
          body: request,
        });
      }

      return createMockBooking(request, mockCart);
    },

    // 取得後端簽好的 ECPay 表單；同一請求寫入 contact 快照（O2）。
    // Fetch signed ECPay form; same request persists contact snapshot (O2).
    createEcpayForm: function (bookingId, contact) {
      if (useMockApi()) {
        return Promise.reject(new Error('ECPay form is unavailable in Mock mode'));
      }

      return restRequest(
        '/booking/checkout/sessions/' + encodeURIComponent(bookingId) + '/ecpay',
        {
          method: 'POST',
          auth: 'required',
          body: { contact: contact || {} },
        }
      );
    },

    cancelBooking: function (bookingId) {
      if (!useMockApi()) {
        return restRequest('/booking/checkout/sessions/' + encodeURIComponent(bookingId) + '/cancel', {
          method: 'POST',
          auth: 'required',
        });
      }

      var stored = readStorage(MOCK_BOOKINGS_KEY, []);
      var booking = stored.find(function (item) {
        return String(item.id || item.bookingId) === String(bookingId);
      });
      if (!booking) {
        return Promise.reject(new Error('Booking not found'));
      }

      booking.status = 'cancelled';
      booking.checkoutStep = 'closed';
      writeStorage(MOCK_BOOKINGS_KEY, stored);

      return Promise.resolve(booking);
    },

    loadAvailabilityContext: loadAvailabilityContext,
  };

  global.BookingAPI = BookingAPI;
})(typeof window !== 'undefined' ? window : this);

console.log('✓ BookingAPI 已初始化');
