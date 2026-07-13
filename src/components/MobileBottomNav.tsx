/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Clover, Compass, Film, Home, Play, Search, Sparkles, Star, Tv, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface MobileBottomNavProps {
  activePath?: string;
}

const MobileBottomNav = ({ activePath }: MobileBottomNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastScrollY = useRef(0);
  const [visible, setVisible] = useState(true);

  const currentUrl = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const currentActive = activePath ?? currentUrl;

  const [navItems, setNavItems] = useState([
    { icon: Home, label: '首页', href: '/' },
    { icon: Search, label: '搜索', href: '/search' },
    { icon: Compass, label: '浏览', href: '/browse' },
    { icon: Film, label: '电影', href: '/douban?type=movie' },
    { icon: Tv, label: '剧集', href: '/douban?type=tv' },
    { icon: Sparkles, label: '动漫', href: '/douban?type=tv&sub=tv_animation' },
    { icon: Clover, label: '综艺', href: '/douban?type=show' },
    { icon: Video, label: '纪录片', href: '/douban?type=tv&sub=tv_documentary' },
    { icon: Play, label: 'B站', href: '/bilibili' },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setNavItems((prevItems) => [
        ...prevItems,
        {
          icon: Star,
          label: '自定义',
          href: '/douban?type=custom',
        },
      ]);
    }
  }, []);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
            setVisible(false);
          } else {
            setVisible(true);
          }
          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (href: string) => {
    const typeMatch = href.match(/type=([^&]+)/)?.[1];
    const subMatch = href.match(/sub=([^&]+)/)?.[1];

    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);

    if (decodedActive === decodedItemHref) return true;

    if (decodedActive.startsWith('/douban') && typeMatch) {
      const activeHasSub = decodedActive.includes('sub=');
      const itemHasSub = !!subMatch;

      if (itemHasSub) {
        return decodedActive.includes(`type=${typeMatch}`) &&
          decodedActive.includes(`sub=${subMatch}`);
      } else {
        return decodedActive.includes(`type=${typeMatch}`) && !activeHasSub;
      }
    }

    return false;
  };

  return (
    <nav
      className={`md:hidden fixed left-0 right-0 z-[600] bg-white/90 backdrop-blur-xl border-t border-gray-200/50 overflow-hidden dark:bg-gray-900/80 dark:border-gray-700/50 transition-transform duration-300 ${visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      style={{
        bottom: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <ul className='flex items-center justify-around overflow-x-auto scrollbar-hide'>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li
              key={item.href}
              className='flex-1 min-w-0'
            >
              <Link
                href={item.href}
                className='flex flex-col items-center justify-center w-full h-14 gap-1 text-xs'
              >
                <item.icon
                  className={`h-6 w-6 ${active
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500 dark:text-gray-400'
                    }`}
                />
                <span
                  className={
                    active
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileBottomNav;
