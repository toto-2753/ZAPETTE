import { useMemo } from 'react';
import type { LiveChannel, Stream } from '../data/types';
import { canShare, isAndroid, isIOS } from '../lib/platform';
import { channelShareData, copyText, nativeShare, openInVlc } from '../lib/share';
import { qrSvg } from '../lib/qr';
import { Icon } from './Icon';
import { Sheet, toast } from './ui';

export function ShareSheet({ ch, stream, onClose }: { ch: LiveChannel; stream?: Stream; onClose: () => void }) {
  const data = channelShareData(ch);
  const qr = useMemo(() => qrSvg(data.url), [data.url]);
  const copy = async (text: string, done: string) => toast((await copyText(text)) ? done : 'Copie impossible sur cet appareil.');
  return (
    <Sheet title={`Partager ${ch.n}`} onClose={onClose}>
      <div className="share">
        <div className="share-qr">
          <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p>Scanne ce code avec un autre téléphone ou une tablette pour ouvrir {ch.n} directement.</p>
        </div>
        <div className="share-actions">
          {canShare && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const r = await nativeShare(data);
                if (r === 'shared') onClose();
              }}
            >
              <Icon name="share" size={18} /> Envoyer…
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => copy(data.url, 'Lien de la chaîne copié.')}>
            <Icon name="copy" size={18} /> Copier le lien Zapette
          </button>
          {stream && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => copy(stream.u, 'Adresse du flux copiée (VLC, Kodi, apps IPTV).')}>
                <Icon name="signal" size={18} /> Copier l’adresse du flux
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => openInVlc(ch, stream)}>
                <Icon name="external" size={18} /> {isIOS || isAndroid ? 'Ouvrir dans VLC' : 'Télécharger pour VLC (.m3u)'}
              </button>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
