import type { HomepageSection, ContentPage } from '@/types/cms';

export const DEFAULT_HOMEPAGE_SECTIONS: Array<Omit<HomepageSection, 'id' | 'updatedAt'>> = [
  {
    sectionKey: 'hero',
    title: 'Timeless Elegance & Modern Style',
    subtitle: 'The Jewel Gallery — Sri Lanka',
    displayOrder: 1,
    isEnabled: true,
    configData: {
      headline: 'Timeless Elegance',
      italicWord: 'Modern Style',
      ctaText: 'Explore Catalog',
      ctaLink: '/shop',
    },
  },
  {
    sectionKey: 'pillars',
    title: 'The Splender Jewel Distinction',
    subtitle: 'Why our patrons choose us',
    displayOrder: 2,
    isEnabled: true,
    configData: {
      pillar1: 'Curated Fashion Jewellery',
      pillar2: 'Islandwide Delivery',
      pillar3: 'Personal WhatsApp Care',
    },
  },
  {
    sectionKey: 'categories',
    title: 'Curated Collections',
    subtitle: 'Explore by jewelry category',
    displayOrder: 3,
    isEnabled: true,
    configData: {},
  },
  {
    sectionKey: 'featured_products',
    title: 'Signature & Trending Pieces',
    subtitle: 'Hand-selected pieces for every occasion',
    displayOrder: 4,
    isEnabled: true,
    configData: {
      maxItems: 8,
    },
  },
  {
    sectionKey: 'reviews',
    title: 'Patron Testimonials',
    subtitle: 'What our distinguished clients say',
    displayOrder: 5,
    isEnabled: true,
    configData: {
      minRating: 4,
    },
  },
];

export const DEFAULT_CONTENT_PAGES: Array<Omit<ContentPage, 'id' | 'updatedAt'>> = [
  {
    slug: 'about',
    title: 'About Splender Jewel',
    content: `# About Splender Jewel\n\nAt Splender Jewel, we believe every piece of jewellery should make you feel special.\n\nOur collection brings together elegance, modern trends, and timeless style, offering beautiful accessories for everyday wear and memorable occasions.\n\nWhether you're looking for something simple and elegant or a statement piece that stands out, Splender Jewel helps you express your unique style with confidence.\n\nWe are proud to bring stylish fashion jewellery to customers across Sri Lanka, with islandwide delivery.\n\n**Splender Jewel — A Little Sparkle, A Lot of Elegance.**`,
    metaTitle: 'About Splender Jewel | Elegance & Fashion Jewellery',
    metaDescription: 'Discover Splender Jewel — stylish fashion jewellery and accessories based in Negombo, Sri Lanka, with Islandwide Delivery.',
  },
  {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    content: `# Customer Inquiries & FAQ\n\n### 1. What is Splender Jewel?\nSplender Jewel is a Sri Lankan fashion jewellery brand based in Negombo, offering stylish jewellery and accessories for everyday wear, gifting, and special occasions.\n\n### 2. Do you offer Islandwide Delivery?\nYes! Splender Jewel offers Islandwide Delivery across Sri Lanka through Sri Lanka Post services.\n\n### 3. What payment methods do you accept?\nWe accept Cash on Delivery (COD) and Bank Transfer.\n\nWith COD, you pay in cash when your order is delivered.\n\nFor Bank Transfer, payment confirmation is required before dispatch.\n\n### 4. How are orders delivered?\nCash on Delivery orders are dispatched through Sri Lanka Post COD Service.\n\nBank Transfer orders are dispatched through Sri Lanka Post Speed Post Service after payment verification.\n\n### 5. How long does delivery take?\nEstimated delivery time is 24–48 hours on working days after dispatch.\n\nDelivery times may vary depending on location, postal operations, public holidays and unforeseen circumstances.\n\n### 6. How much does delivery cost?\nDelivery charges depend on your delivery location and selected service. The applicable delivery fee will be displayed during checkout.\n\n### 7. How can I place an order?\nBrowse our collection, select your favourite items and add them to your cart.\n\nWhen online checkout is available, enter your delivery details and select your preferred payment method.\n\nFor assistance, contact us through our official communication channels.\n\n### 8. Can I track my order?\nOnce your order is dispatched, you can contact our team for delivery information. Tracking details will be provided where available.\n\n### 9. Can I cancel my order?\nPlease contact us as soon as possible if you wish to cancel your order.\n\nCancellation requests depend on whether the order has already been processed or dispatched.\n\n### 10. Do you accept returns or exchanges?\nReturns and exchanges are generally not accepted for changes of mind.\n\nIf you receive an incorrect or damaged item, please contact us promptly with your order details and photographs so we can review the issue in accordance with applicable consumer protection laws.\n\n### 11. Where is Splender Jewel located?\nSplender Jewel is based in Negombo, Sri Lanka.\n\n### 12. How can I contact Splender Jewel?\nYou can contact us through our official website contact channels, WhatsApp or Instagram.\n\nInstagram: https://www.instagram.com/splender_jewel/`,
    metaTitle: 'Frequently Asked Questions | Splender Jewel',
    metaDescription: 'Find answers regarding Splender Jewel fashion jewellery, Islandwide Delivery via Sri Lanka Post, and payment methods.',
  },
  {
    slug: 'shipping',
    title: 'Shipping & Delivery',
    content: `# Shipping & Delivery\n\nSplender Jewel provides **Islandwide Delivery** across Sri Lanka via Sri Lanka Post services.\n\n- **Cash on Delivery (COD):** Dispatched via Sri Lanka Post COD Service.\n- **Bank Transfer:** Dispatched via Sri Lanka Post Speed Post Service after payment verification.\n\nEstimated delivery time is **24–48 hours on working days after dispatch**.\n\nFor detailed inquiries, please visit our [Frequently Asked Questions](/faq).`,
    metaTitle: 'Shipping & Delivery | Splender Jewel',
    metaDescription: 'Islandwide Delivery information across Sri Lanka via Sri Lanka Post services.',
  },
  {
    slug: 'returns',
    title: 'Returns & Exchanges',
    content: `# Returns & Exchanges\n\nReturns and exchanges are generally not accepted for changes of mind.\n\nIf you receive an incorrect or damaged item, please contact us promptly with your order details and photographs so we can review the issue in accordance with applicable consumer protection laws.\n\n### How to Reach Us\n- **WhatsApp:** +94 76 468 9907\n- **Instagram:** https://www.instagram.com/splender_jewel/`,
    metaTitle: 'Returns & Exchanges | Splender Jewel',
    metaDescription: 'Returns and exchanges policy for Splender Jewel fashion jewellery and accessories.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: `# Privacy Policy\n\nSplender Jewel ("we", "our", or "us"), based in Negombo, Sri Lanka, is committed to safeguarding your privacy. This Privacy Policy explains how we collect, use, and protect your information when you visit our website, register an account, or place an order.\n\n### Personal Information We Collect\nWe collect personal information that you voluntarily provide to us when using our services. This includes:\n- Full name\n- Email address\n- Contact telephone numbers\n- Delivery address and district\n- Order and purchase history\n\n### Account Registration & Login Sessions\nWhen you register an account, our authentication systems securely process your credentials, profile details, and session tokens. This enables you to access saved addresses, review past orders, and manage your wishlist securely across visits.\n\n### Payment Information\nWe support two approved payment methods:\n\nCash on Delivery (COD): Customers pay in cash when their order is delivered. No advance payment or online payment information is required for COD orders.\n\nBank Transfer: Customers making a direct deposit or bank transfer may be requested to provide a transfer reference or payment slip for verification before order dispatch. Splender Jewel will **never** ask for your bank account passwords, ATM PINs, OTPs, or confidential banking credentials.\n\n### How Information Is Used\nWe use personal data solely for legitimate business operations:\n- To process, verify, and dispatch your orders.\n- To communicate order confirmations, dispatch updates, and delivery information.\n- To respond to inquiries via WhatsApp, email, or Instagram.\n- To maintain account security and prevent fraudulent activities.\n\n### Order Processing & Sharing with Courier Partners\nWe do not sell, rent, or trade your personal information. We share only necessary delivery details (name, delivery address, phone numbers) with **Sri Lanka Post** (Sri Lanka Post COD Service and Speed Post Service) to complete physical delivery of your parcels.\n\n### Technology & Infrastructure Providers\nOur website utilizes secure hosting and database infrastructure provided by Vercel and Supabase, operating under strict commercial privacy and security standards.\n\n### Cookies & Session Management\nWe use essential cookies and session storage strictly necessary to keep you signed in, preserve your shopping cart, and maintain website security. We do not use intrusive third-party cross-site tracking cookies.\n\n### Account & Website Security\nWe implement standard technical and organizational security controls to protect your data from unauthorized access, modification, or disclosure. Communications between your browser and our servers are encrypted using Secure Sockets Layer / Transport Layer Security (SSL/TLS).\n\n### Data Retention\nWe retain personal information only for as long as required to fulfill orders, maintain customer accounts, comply with legal, accounting, and tax requirements, or resolve disputes.\n\n### Your Privacy Rights\nYou have the right to access, review, update, or request deletion of your personal account information. You may update your account details directly through your account dashboard or by contacting us.\n\n### Third-Party Services\nOur website may contain links to our official Instagram page. We encourage you to review the privacy policies of external platforms, as their data handling is governed by their respective privacy terms.\n\n### International Data Processing\nOur cloud hosting and database systems may process and store data on secure server facilities located outside Sri Lanka in compliance with standard security protocols.\n\n### Children's Privacy\nOur website is not directed at children under the age of 13, and we do not knowingly collect personal data from children.\n\n### Policy Updates\nWe may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated revision date.\n\n### Contact Information for Privacy Requests\nFor questions, updates, or requests regarding your personal information, please contact us:\n- **Location:** Negombo, Sri Lanka\n- **WhatsApp Support:** +94 76 468 9907\n- **Instagram:** https://www.instagram.com/splender_jewel/`,
    metaTitle: 'Privacy Policy | Splender Jewel',
    metaDescription: 'How Splender Jewel protects your personal data, customer privacy, and delivery information.',
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    content: `# Terms & Conditions\n\nWelcome to **Splender Jewel**. By accessing our website, browsing our collections, or placing an order, you agree to comply with and be bound by the following Terms & Conditions.\n\n### 1. About Splender Jewel & Products\nSplender Jewel is a Sri Lankan fashion jewellery and accessories brand based in Negombo, offering stylish accessories for everyday wear, gifting, and special occasions.\n\n### 2. Product Availability\nAll items are subject to availability. Products are displayed as **In Stock** or **Out of Stock**. While we make every effort to reflect accurate stock, items may occasionally become unavailable before an order is processed.\n\n### 3. Ordering & Confirmation\nPlacing items in your shopping bag does not reserve them until order submission is complete. Once your order is received, you will receive an order confirmation detailing your order reference and purchase summary.\n\n### 4. Pricing & Currency\nAll prices on Splender Jewel are listed in **Sri Lankan Rupees (LKR)**. Delivery charges depend on your delivery location and will be displayed during checkout.\n\n### 5. Approved Payment Methods\nWe accept two payment methods:\n- **Cash on Delivery (COD):** Customers pay in cash when their order is delivered. No advance payment is required for COD orders.\n- **Bank Transfer:** Customers make a direct bank deposit or bank transfer. Payment confirmation is required before dispatch.\n\n### 6. Delivery Services\n- Cash on Delivery orders are dispatched through **Sri Lanka Post COD Service**.\n- Bank Transfer orders are dispatched through **Sri Lanka Post Speed Post Service** after payment verification.\n\n### 7. Islandwide Delivery Coverage\nSplender Jewel provides **Islandwide Delivery** across Sri Lanka.\n\n### 8. Delivery Timeframe\nEstimated delivery time is **24–48 hours on working days after dispatch**. Delivery estimates are subject to postal operations, location, public holidays and unforeseen delays. We do not provide guaranteed delivery times.\n\n### 9. Order Cancellations\nPlease contact us as soon as possible if you wish to cancel your order. Cancellation requests depend on whether the order has already been processed or dispatched. Once an order has been dispatched with Sri Lanka Post, it cannot be cancelled.\n\n### 10. Returns & Exchanges\nReturns and exchanges are generally not accepted for changes of mind. If you receive an incorrect or damaged item, please contact us promptly with your order details and photographs so we can review the issue in accordance with applicable consumer protection laws.\n\n### 11. Product Care\nOur accessories are crafted for fashion wear. To prolong their beauty and finish, avoid contact with water, perfumes, lotions, and harsh chemicals. Store accessories in a dry place when not in use.\n\n### 12. Website Information Accuracy\nWe strive to display accurate descriptions, pricing, and images. Minor colour variations may occur due to screen settings and photographic lighting.\n\n### 13. Intellectual Property\nAll website content, including brand name, logo, images, graphics, and text, is the property of Splender Jewel and protected by intellectual property laws.\n\n### 14. Customer Privacy\nYour personal information is collected and processed in accordance with our Privacy Policy.\n\n### 15. Changes to Terms\nWe reserve the right to update these Terms & Conditions at any time. Changes will take effect immediately upon publication on this website.\n\n### 16. Consumer Rights\nNothing in these Terms excludes or limits any customer rights available under applicable laws of Sri Lanka.\n\n### 17. Official Contact Information\nFor inquiries regarding these Terms & Conditions:\n- **Location:** Negombo, Sri Lanka\n- **WhatsApp Support:** +94 76 468 9907\n- **Instagram:** https://www.instagram.com/splender_jewel/`,
    metaTitle: 'Terms & Conditions | Splender Jewel',
    metaDescription: 'Terms and conditions for orders, purchases, and services on Splender Jewel.',
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    content: `# Get in Touch with Splender Jewel\n\nOur team is delighted to assist you with inquiries, product advice, order assistance, and Bank Transfer verifications.\n\n- **Location:** Negombo, Sri Lanka\n- **WhatsApp Support:** +94 76 468 9907\n- **Official Instagram:** https://www.instagram.com/splender_jewel/`,
    metaTitle: 'Contact Us | Splender Jewel',
    metaDescription: 'Get in touch with Splender Jewel team in Negombo, Sri Lanka via WhatsApp or Instagram.',
  },
];
