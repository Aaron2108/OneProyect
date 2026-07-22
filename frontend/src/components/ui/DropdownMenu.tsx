import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

interface MenuItemDef {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function DropdownMenu({
  trigger,
  items,
  header,
}: {
  trigger: ReactNode;
  items: MenuItemDef[];
  header?: ReactNode;
}): JSX.Element {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className="wf-popover" align="end" sideOffset={10} style={{ minWidth: 200 }}>
          {header && <div className="mb-1 border-b border-line px-2 pb-2">{header}</div>}
          {items.map((item, i) => (
            <RadixMenu.Item
              key={i}
              onSelect={item.onSelect}
              className="wf-menu-item"
              style={item.danger ? { color: 'var(--danger)' } : undefined}
            >
              {item.label}
            </RadixMenu.Item>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
