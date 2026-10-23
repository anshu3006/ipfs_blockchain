// UploadFile page
import FileUpload from "../components/FileUpload";
import Notice from "../components/Notice";

export default function UploadFile({ session }) {
  const { attributes } = session;
  return (
    <div className="page">
      <h2>Upload a file</h2>
      <p className="lead">
        The file is encrypted and stored on IPFS. Its CID, hash and access policy are recorded in the smart contract.
      </p>
      {attributes.registered ? (
        <FileUpload defaultPolicy={{ department: attributes.department }} />
      ) : (
        <Notice notice={{ type: "warn", text: "Only registered users can upload. Ask the admin to register your wallet." }} />
      )}
    </div>
  );
}
