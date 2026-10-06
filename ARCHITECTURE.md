# AzadiMart — System Architecture

## 1. Product Overview

AzadiMart is an India-focused multi-vendor commerce platform with three separate user experiences:

- Customer storefront: `azadimart.com`
- Seller Centre: `seller.azadimart.com`
- Admin Console: `admin.azadimart.com`

The platform is designed to support marketplace commerce first, followed by seller subscriptions, farm-to-business procurement, direct sourcing and long-term omnichannel retail.

The system must be designed for production use, security, scalability and maintainability.

---

## 2. Core Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui



### Backend

- TypeScript
- Next.js server-side APIs / route handlers
- REST-style APIs initially
- Strong request validation
- Centralized error handling



### Database

- PostgreSQL
- Neon PostgreSQL
- SQL migrations
- Repository/data-access layer



### Storage

Object storage for:

- Product images
- Product videos
- A+ product content
- Homepage banners
- Seller documents
- Customer/seller files



### Authentication

Role-based authentication supporting:

- CUSTOMER
- SELLER
- ADMIN
- SUPER_ADMIN



### Source Control

- Git
- GitHub



### Deployment

- Vercel or equivalent production hosting
- Neon for PostgreSQL
- CDN/object storage for media

---



## 3. High-Level Architecture

```text

                         AZADIMART PLATFORM

                                  |

                +-----------------+-----------------+

                |                 |                 |

                v                 v                 v

          STOREFRONT           SELLER             ADMIN

       [azadimart.com](http://azadimart.com)      [seller.azadimart.com](http://seller.azadimart.com)   [admin.azadimart.com](http://admin.azadimart.com)

                |                 |                 |

                +-----------------+-----------------+

                                  |

                              API Layer

                                  |

          +-----------------------+-----------------------+

          |             |             |                 |

          v             v             v                 v

       Database       Storage      Payments          Logistics

       (Neon)      (Object Store)  Provider          Providers

          |

          v

     PostgreSQL
```

