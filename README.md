# S3 Direct Upload 

This repository contains the code for deploying an application on AWS Elastic Beanstalk. It includes configuration files (such as those in the `.ebextensions/` directory) to set up resources, HTTPS, and other instance-level configurations.

## Prerequisites

- **AWS CLI**  
  Ensure you have the [AWS CLI installed](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

- **EB CLI**  
  Install the [Elastic Beanstalk CLI](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-install.html).

- **Node.js and npm**  
  Install [Node.js](https://nodejs.org/) (which includes npm) if you haven't already.

- **AWS SSO (if applicable)**  
  If you use AWS Single Sign-On (SSO) for authentication, make sure it’s configured in your AWS CLI.

## AWS Profile and Authentication

If you have more than one AWS profile, set the correct one before running any commands:

```bash
export AWS_DEFAULT_PROFILE=profile-name
```


For AWS SSO users, sign in via the CLI:

```bash
aws sso login
```

You can verify that you’re connected to the right AWS account and have the expected access by listing your S3 buckets. Look for your expected bucket:

```bash
aws s3 ls
```

**Installing Dependencies**
Before deployment, install the necessary Node.js tools and project dependencies. Run:
```bash
npm install
```

**Configuration**

Before deploying the application, make sure to replace all placeholder variables. All placeholders begin with "INSERT_" – search through the repository for these strings and replace them with your actual values.

For example, if you see a variable like:

```bash
Resource: "arn:aws:s3:::INSERT_YOUR_BUCKET_NAME/*"
```

Replace INSERT_YOUR_BUCKET_NAME with your actual S3 bucket name.

**DNS Setup**

If you’re using a custom domain, configure your DNS as follows:
	1.	In the AWS Elastic Beanstalk Console, open your environment.
	2.	Locate the Domain field (this is the EB-provided endpoint).
	3.	Update your custom domain’s CNAME record (or Route 53 alias) to point to this endpoint.

This ensures that your domain directs traffic to your deployed environment.

**Deployment**

To create a new Elastic Beanstalk environment using the EB CLI, run:

```bash
eb create s3-direct-prod
```

	Note: Replace s3-direct-prod with your desired environment name.

This command will create an environment, provision the necessary resources (including a load balancer), and deploy your application code.

**Additional Configuration Files**<br>
- .ebextensions/
  - This folder contains configuration files (e.g., https-instance.config) that apply settings and scripts to your EC2 instances during provisioning. These files help set up HTTPS, install necessary packages, and configure your environment.
- Other Config Files
  - If your project includes other configuration or deployment scripts, ensure they are updated with your custom values as needed.

Troubleshooting
- AWS Credentials:
  - Verify that your AWS profile is set correctly using echo $AWS_DEFAULT_PROFILE and that your SSO session is active if needed.
- Placeholders:
  - Ensure all INSERT_ placeholders have been replaced with your actual values.
- DNS Issues:
  - If your custom domain isn’t resolving correctly, double-check the CNAME/alias record in your DNS provider’s settings.
- EB Environment:
  - If you encounter errors during eb create or eb deploy, review the EB logs and configuration files for any misconfigurations.