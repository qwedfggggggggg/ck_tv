'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

const CATEGORIES = [
  {
    label: '影视',
    href: '/douban?type=movie',
    children: [
      { label: '热门', href: '/douban?type=movie&category=热门' },
      { label: '最新', href: '/douban?type=movie&category=最新' },
      { label: '豆瓣高分', href: '/douban?type=movie&category=豆瓣高分' },
      { label: '冷门佳片', href: '/douban?type=movie&category=冷门佳片' },
    ],
  },
  {
    label: '剧集',
    href: '/douban?type=tv',
    children: [
      { label: '全部', href: '/douban?type=tv' },
      { label: '国产', href: '/douban?type=tv&sub=tv_domestic' },
      { label: '欧美', href: '/douban?type=tv&sub=tv_american' },
      { label: '日本', href: '/douban?type=tv&sub=tv_japanese' },
      { label: '韩国', href: '/douban?type=tv&sub=tv_korean' },
    ],
  },
  { label: '综艺', href: '/douban?type=show' },
  { label: '动漫', href: '/douban?type=tv&sub=tv_animation' },
  { label: '纪录片', href: '/douban?type=tv&sub=tv_documentary' },
  { label: 'B站短视频', href: '/bilibili', highlight: true },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { siteName } = useSite();
  const [searchQuery, setSearchQuery] = useState('');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href.split('?')[0]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <header
      className='sticky top-0 z-50 w-full border-b'
      style={{
        background: 'var(--sytv-bg)',
        borderColor: 'var(--sytv-border)',
      }}
    >
      {/* 渐变顶部装饰条 */}
      <div
        style={{
          height: 3,
          background: 'var(--sytv-gradient)',
        }}
      />

      <div className='flex items-center h-14 px-4 gap-0 max-w-screen-2xl mx-auto'>
        {/* Logo */}
        <Link href='/' className='flex-shrink-0 mr-6'>
          <span
            style={{
              fontWeight: 800,
              fontSize: 20,
              background: 'var(--sytv-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {siteName}
          </span>
        </Link>

        {/* 桌面端导航分类 */}
        <nav className='hidden md:flex items-center gap-0 flex-shrink-0'>
          <Link
            href='/'
            className='px-3 py-1.5 text-sm rounded-md transition-colors'
            style={{
              color: pathname === '/' ? '#fff' : 'var(--sytv-text-secondary)',
              background: pathname === '/' ? 'rgba(255,255,255,0.1)' : 'transparent',
            }}
          >
            首页
          </Link>

          {CATEGORIES.map((cat) => {
            if ('children' in cat && cat.children) {
              const isOpen = openDropdown === cat.label;
              return (
                <div
                  key={cat.label}
                  className='relative'
                  onMouseEnter={() => setOpenDropdown(cat.label)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    className='px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1'
                    style={{
                      color: isActive(cat.href) ? '#fff' : 'var(--sytv-text-secondary)',
                    }}
                  >
                    {cat.label}
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor" style={{ opacity: 0.5 }}>
                      <path d="M1 1l4 4 4-4" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div
                      className='absolute top-full left-0 mt-1 rounded-lg shadow-xl border min-w-[140px] py-1 z-50'
                      style={{
                        background: '#2a2a2a',
                        borderColor: 'var(--sytv-border)',
                      }}
                    >
                      {cat.children.map((child) => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className='block px-4 py-2 text-sm transition-colors'
                          style={{
                            color: isActive(child.href) ? '#fff' : '#aaa',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const isCat = cat as { label: string; href: string; highlight?: boolean };
            return (
              <Link
                key={isCat.label}
                href={isCat.href}
                className='px-3 py-1.5 text-sm rounded-md transition-colors'
                style={{
                  color: isCat.highlight
                    ? isActive(isCat.href) ? '#e6567a' : '#e6567a'
                    : isActive(isCat.href) ? '#fff' : 'var(--sytv-text-secondary)',
                  background: isActive(isCat.href) ? 'rgba(255,255,255,0.1)' : 'transparent',
                  opacity: isCat.highlight && !isActive(isCat.href) ? 0.8 : 1,
                }}
              >
                {isCat.label}
              </Link>
            );
          })}
        </nav>

        {/* 弹性空间 */}
        <div className='flex-1' />

        {/* 搜索框 */}
        <form onSubmit={handleSearch} className='hidden sm:block'>
          <div
            className='flex items-center rounded-full px-3 h-8'
            style={{ background: '#2a2a2a' }}
          >
            <Search size={14} style={{ color: 'var(--sytv-text-secondary)', marginRight: 6 }} />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='搜索影视/综艺/动漫...'
              className='bg-transparent border-none outline-none text-sm w-32 lg:w-44'
              style={{ color: '#ccc' }}
            />
          </div>
        </form>

        {/* 主题切换 + 用户 */}
        <div className='flex items-center gap-2 ml-3'>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
