import React, { useRef, useState } from 'react';
import { api } from '../api/index.js';
import { Avatar, Field, Icon, Modal } from './ui.jsx';

const ROLE_LABEL = { admin: 'Builder admin', sales: 'Sales agent', broker: 'Channel partner', maintenance: 'Maintenance', customer: 'Home owner' };

export default function ProfileModal({ me, onClose, onSaved, onAvatarSaved, say }) {
  const [form, setForm] = useState({
    name: me.user.name || '',
    email: me.user.email || '',
    phone: me.user.phone || '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(api.media(me.user.profile?.avatar_url));
  const avatarInput = useRef(null);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const uploadAvatar = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      say('Choose a JPG, PNG, or WebP image up to 5 MB');
      return;
    }
    setUploading(true);
    const data = new FormData();
    data.append('files', file);
    try {
      const result = await api.post('/api/me/avatar', data);
      setAvatarUrl(api.media(result.avatar_url));
      onAvatarSaved?.();
      say('Profile picture updated');
    } catch (error) {
      say(error.message || 'Could not upload your profile picture');
    } finally {
      setUploading(false);
    }
  };

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch('/api/me/profile', form);
      say('Profile updated');
      onSaved();
    } catch (error) {
      say(error.message || 'Could not update your profile');
    } finally {
      setBusy(false);
    }
  };

  const joined = me.user.created_at
    ? new Date(me.user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return <Modal title="My profile" onClose={onClose} wide footer={<>
    <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
    <button form="profile-edit-form" type="submit" className="btn sun" disabled={busy || !form.name.trim() || !form.email.trim()}>
      {busy ? 'Saving…' : 'Save changes'}
    </button>
  </>}>
    <div className="profile-modal-summary">
      <div className="profile-photo-control">
        <Avatar name={form.name || me.user.name} src={avatarUrl} />
        <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadAvatar} />
        <button type="button" className="btn sm" disabled={uploading} onClick={() => avatarInput.current?.click()}><Icon name="upload" />{uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload picture'}</button>
      </div>
      <div><b>{form.name || me.user.name}</b><span>{ROLE_LABEL[me.user.role] || me.user.role}</span></div>
    </div>
    <form id="profile-edit-form" className="profile-edit-grid" onSubmit={save}>
      <Field label="Full name" id="profile-name"><input id="profile-name" className="input" autoComplete="name" required value={form.name} onChange={set('name')} /></Field>
      <Field label="Email address" id="profile-email"><input id="profile-email" className="input" type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></Field>
      <Field label="Mobile number" id="profile-phone"><input id="profile-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></Field>
    </form>
    <section className="profile-account-details" aria-label="Account details">
      <h4>Account details</h4>
      <div><Icon name="building" /><span>Company</span><b>{me.org.name}</b></div>
      <div><Icon name="user" /><span>Role</span><b>{ROLE_LABEL[me.user.role] || me.user.role}</b></div>
      <div><Icon name="chat" /><span>WhatsApp</span><b>{me.user.whatsapp?.display || 'Not connected'}</b></div>
      <div><Icon name="calendar" /><span>Member since</span><b>{joined}</b></div>
    </section>
  </Modal>;
}
